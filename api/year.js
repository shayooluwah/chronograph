/**
 * Vercel serverless function — GET /api/year?year=1754
 *
 * Fetches up to 60 historical events from the Wikidata SPARQL endpoint,
 * normalised into the HistoricalEvent shape defined in src/types/index.ts.
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// ── SPARQL query templates ────────────────────────────────────────────────────

const BIRTHS_QUERY = (year) => `
SELECT ?item ?itemLabel ?description ?article WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P569 ?birth.
  FILTER(YEAR(?birth) = ${year})
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 15`;

const DEATHS_QUERY = (year) => `
SELECT ?item ?itemLabel ?description ?article WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P570 ?death.
  FILTER(YEAR(?death) = ${year})
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 15`;

const EVENTS_QUERY = (year) => `
SELECT ?item ?itemLabel ?description ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q198;
        wdt:P585 ?date.
  FILTER(YEAR(?date) = ${year})
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 15`;

const ORGANIZATIONS_QUERY = (year) => `
SELECT ?item ?itemLabel ?description ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q43229;
        wdt:P571 ?founded.
  FILTER(YEAR(?founded) = ${year})
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 15`;

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
 * Fetches one category and returns normalised HistoricalEvent objects.
 */
async function fetchCategory(query, category, year) {
  try {
    const data = await runSparqlQuery(query);
    const bindings = data?.results?.bindings ?? [];
    return bindings.map((b) => normaliseBinding(b, category, year));
  } catch (err) {
    // Surface the error as a console warning but don't crash the whole response
    console.error(`[year.js] Failed to fetch category "${category}":`, err.message);
    return [];
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
  const [births, deaths, events, organizations] = await Promise.all([
    fetchCategory(BIRTHS_QUERY(year), 'birth', year),
    fetchCategory(DEATHS_QUERY(year), 'death', year),
    fetchCategory(EVENTS_QUERY(year), 'event', year),
    fetchCategory(ORGANIZATIONS_QUERY(year), 'organization', year),
  ]);

  // Merge all categories (already capped at 15 each ⇒ max 60 total)
  const results = [...births, ...deaths, ...events, ...organizations];

  // ── Cache & respond ───────────────────────────────────────────────────────
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).json(results);
}
