/**
 * Vercel serverless function — GET /api/year?year=1754
 *
 * Fetches up to 60 historical events from the Wikidata SPARQL endpoint,
 * normalised into the HistoricalEvent shape defined in src/types/index.ts.
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// ── SPARQL query templates ────────────────────────────────────────────────────
//
// Performance notes (these queries previously timed out at WDQS's 60s limit):
// - FILTER(YEAR(?d) = N) forces a scan of every statement of the property.
//   An explicit xsd:dateTime range with `hint:Prior hint:rangeSafe true`
//   lets Blazegraph use its range index instead.
// - The core match is wrapped in a LIMITed subquery so the OPTIONAL Wikipedia
//   article join and the label service only run on 15 rows, not millions.
// Measured: births query went from >60s (timeout) to ~1s.

/** ISO dateTime for Jan 1 of a (possibly negative / BCE) year. */
function isoYearStart(year) {
  const abs = String(Math.abs(year)).padStart(4, '0');
  return `${year < 0 ? '-' : ''}${abs}-01-01T00:00:00Z`;
}

/** [start, end) xsd:dateTime bounds covering exactly one year. */
function yearBounds(year) {
  // The proleptic Gregorian year after -1 (1 BCE) is 0 in XSD 1.1
  return [isoYearStart(year), isoYearStart(year + 1)];
}

/**
 * Builds one category query: items whose `dateProp` falls inside the year,
 * restricted to a class via `classTriple`.
 *
 * `classFirst` controls join order: large classes (humans, organizations)
 * must be entered via the indexed date range; small classes (war) are cheaper
 * to enumerate first and then range-check.
 */
function buildQuery(year, dateProp, classTriple, { classFirst = false } = {}) {
  const [start, end] = yearBounds(year);
  const dateMatch = `?item wdt:${dateProp} ?when. hint:Prior hint:rangeSafe true.
      FILTER("${start}"^^xsd:dateTime <= ?when && ?when < "${end}"^^xsd:dateTime)`;
  const core = classFirst
    ? `${classTriple}
      ${dateMatch}`
    : `${dateMatch}
      ${classTriple}`;
  return `
SELECT ?item ?itemLabel ?description ?article WHERE {
  { SELECT ?item WHERE {
      ${core}
    } LIMIT 15 }
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const BIRTHS_QUERY        = (year) => buildQuery(year, 'P569', '?item wdt:P31 wd:Q5.');
const DEATHS_QUERY        = (year) => buildQuery(year, 'P570', '?item wdt:P31 wd:Q5.');
const EVENTS_QUERY        = (year) => buildQuery(year, 'P585', '?item wdt:P31/wdt:P279* wd:Q198.', { classFirst: true });
const ORGANIZATIONS_QUERY = (year) => buildQuery(year, 'P571', '?item wdt:P31/wdt:P279* wd:Q43229.');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts a Wikidata entity ID (e.g. "Q12345") from a full URI
 * like "http://www.wikidata.org/entity/Q12345".
 */
function extractWikidataId(uri) {
  const match = uri.match(/\/entity\/(Q\d+)$/);
  return match ? match[1] : uri;
}

/**
 * Executes a single SPARQL query against the Wikidata endpoint and returns
 * the parsed JSON results object.
 */
async function runSparqlQuery(sparql) {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set('query', sparql);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/sparql-results+json',
      // Wikidata requests a descriptive User-Agent
      'User-Agent': 'Chronograph/1.0 (https://github.com/chronograph; contact@example.com)',
    },
    // Fail fast instead of letting one slow query hold the whole response
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`Wikidata SPARQL error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

/**
 * Converts a raw SPARQL result binding into a HistoricalEvent object.
 *
 * @param {object} binding  - One row from results.bindings
 * @param {string} category - EventCategory label for this query
 * @param {number} year     - The requested year (integer)
 */
function normaliseBinding(binding, category, year) {
  const itemUri = binding.item?.value ?? '';
  const wikidataId = extractWikidataId(itemUri);

  const articleUri = binding.article?.value ?? '';
  const wikipediaUrl = articleUri.startsWith('https://en.wikipedia.org/') ? articleUri : undefined;

  return {
    id: wikidataId,
    title: binding.itemLabel?.value ?? wikidataId,
    description: binding.description?.value ?? '',
    year,
    category,
    wikidataId,
    ...(wikipediaUrl && { wikipediaUrl }),
  };
}

/**
 * Fetches one category and returns normalised HistoricalEvent objects plus an
 * `ok` flag, so the handler can avoid CDN-caching degraded responses.
 */
async function fetchCategory(query, category, year) {
  try {
    const data = await runSparqlQuery(query);
    const bindings = data?.results?.bindings ?? [];
    return { ok: true, items: bindings.map((b) => normaliseBinding(b, category, year)) };
  } catch (err) {
    // Surface the error as a console warning but don't crash the whole response
    console.error(`[year.js] Failed to fetch category "${category}":`, err.message);
    return { ok: false, items: [] };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate ?year param ──────────────────────────────────────────────────
  const rawYear = req.query?.year;
  const year = parseInt(rawYear, 10);

  if (!rawYear || isNaN(year)) {
    return res.status(400).json({ error: 'Missing or invalid "year" query parameter.' });
  }

  // ── Parallel SPARQL fetches ───────────────────────────────────────────────
  const categories = await Promise.all([
    fetchCategory(BIRTHS_QUERY(year), 'birth', year),
    fetchCategory(DEATHS_QUERY(year), 'death', year),
    fetchCategory(EVENTS_QUERY(year), 'event', year),
    fetchCategory(ORGANIZATIONS_QUERY(year), 'organization', year),
  ]);

  // Merge all categories (already capped at 15 each ⇒ max 60 total)
  const results = categories.flatMap((c) => c.items);
  const allOk   = categories.every((c) => c.ok);

  // ── Cache & respond ───────────────────────────────────────────────────────
  // Only let the CDN cache complete responses; a degraded response (one or
  // more categories failed) must not be served for the next 24 hours.
  res.setHeader('Cache-Control', allOk ? 'public, max-age=86400' : 'no-store');
  return res.status(200).json(results);
}
