/**
 * Vercel serverless function — GET /api/year?year=1754
 *
 * Fetches historical events from the Wikidata SPARQL endpoint, normalised into
 * the HistoricalEvent shape defined in src/types/index.ts.
 *
 * Recall comes from querying many date predicates, not just one:
 *   P569 date of birth · P570 date of death · P580 start time ·
 *   P582 end time · P585 point in time · P571 inception · P577 publication date ·
 *   P575 time of discovery / invention
 *
 * This is what surfaces events the old single-predicate query missed — wars and
 * conflicts (dated by P580 start time → e.g. WWI 1914, the Nigerian Civil War
 * 1967), country independences / foundings (P571 inception on sovereign states →
 * e.g. the 1960 "Year of Africa"), and sporting events like the FIFA World Cup
 * (P585 / P580 on sports competitions).
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// ── SPARQL query construction ─────────────────────────────────────────────────
//
// Performance notes (WDQS enforces a 60s limit; the frontend gives up at 30s):
// - An explicit xsd:dateTime range with `hint:Prior hint:rangeSafe true` lets
//   Blazegraph use its range index instead of scanning every statement.
// - Each branch is a LIMITed subquery ordered by `wikibase:sitelinks` (a good
//   notability proxy) so the most significant items surface first instead of an
//   arbitrary slice. Without this the headline event (e.g. the World Cup) gets
//   buried under thousands of minor ones sharing the year.
// - Join order matters. Small, specific classes (war, sovereign state, sports
//   competition) are cheapest entered class-first then range-checked. Huge
//   classes (humans) must be entered via the indexed date range instead.
// - Branches over broad date predicates with no cheap class test (publications,
//   organizations) would time out if every candidate were sitelink-counted, so
//   they cut the candidate set by a sitelink threshold first; organizations then
//   apply the expensive instance-of/subclass-of path to only that small set.

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
 * One or more date triples, range-bounded to the year. A single predicate binds
 * directly; several are UNION'd so an item matches via any of them.
 */
function dateMatch(dateProps, start, end) {
  const triples = dateProps.length === 1
    ? `?item wdt:${dateProps[0]} ?when.`
    : dateProps.map((p) => `{ ?item wdt:${p} ?when. }`).join(' UNION ');
  return `${triples}
      hint:Prior hint:rangeSafe true.
      FILTER("${start}"^^xsd:dateTime <= ?when && ?when < "${end}"^^xsd:dateTime)`;
}

/**
 * Builds one UNION branch: a LIMITed, sitelink-ordered subquery that tags every
 * row with its category via `?cat`.
 *
 * @param {object} branch
 * @param {string}   branch.category    - EventCategory tag for these rows
 * @param {string[]} branch.dateProps   - date predicates to match (P-numbers)
 * @param {string}  [branch.classTriple]- instance/subclass restriction, if any
 * @param {boolean} [branch.classFirst] - enter via the class (small classes)
 * @param {boolean} [branch.nested]     - cut by sitelinks first, then class-test
 * @param {number}  [branch.minSitelinks]- drop items below this sitelink count
 * @param {number}  [branch.nestedLimit] - nested: high-sitelink pre-cut size (def. 60)
 * @param {number}   branch.limit       - rows kept from this branch
 */
function buildBranch(branch, start, end) {
  const { category, dateProps, classTriple, classFirst, nested, minSitelinks, nestedLimit, limit } = branch;
  const date     = dateMatch(dateProps, start, end);
  const slFilter = minSitelinks ? `FILTER(?sl >= ${minSitelinks})` : '';

  // Organizations: P571 (inception) is shared by countries, places and orgs, and
  // the org subclass path is expensive — so reduce to the most-linked inceptions
  // first, then apply the class test to only those ~60 candidates.
  if (nested) {
    return `  {
    { SELECT ?item ?sl ("${category}" AS ?cat) WHERE {
        { SELECT DISTINCT ?item ?sl WHERE {
            ${date}
            ?item wikibase:sitelinks ?sl. ${slFilter}
          } ORDER BY DESC(?sl) LIMIT ${nestedLimit ?? 60} }
        ${classTriple}
      } LIMIT ${limit} }
  }`;
  }

  // Class-first (small classes) vs date-first (huge classes, lean on the index).
  const core = classFirst
    ? `${classTriple}
      ${date}`
    : `${date}
      ${classTriple ?? ''}`;

  return `  {
    { SELECT DISTINCT ?item ?sl ("${category}" AS ?cat) WHERE {
        ${core}
        ?item wikibase:sitelinks ?sl. ${slFilter}
      } ORDER BY DESC(?sl) LIMIT ${limit} }
  }`;
}

/**
 * Assembles a group of branches into one query: their UNION, plus a single
 * Wikipedia-article join and label/description resolution over the merged rows.
 */
function buildGroupQuery(year, branches) {
  const [start, end] = yearBounds(year);
  const union = branches.map((b) => buildBranch(b, start, end)).join('\n  UNION\n');
  return `
SELECT DISTINCT ?item ?cat ?itemLabel ?description ?article WHERE {
${union}
  OPTIONAL { ?article schema:about ?item; schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?item schema:description ?description.
  }
}`;
}

// ── Query groups ──────────────────────────────────────────────────────────────
//
// Each group is one physical request (kept parallel to bound wall-clock under
// the 30s frontend timeout). Branches are grouped by cost: the sports query is
// the slow one (~15-20s) so it runs alone; everything else is a few seconds.

const Q_HUMAN     = '?item wdt:P31 wd:Q5.';
const Q_WAR       = '?item wdt:P31/wdt:P279* wd:Q198.';         // war / conflict / battle
const Q_STATE     = '?item wdt:P31/wdt:P279* wd:Q3624078.';     // sovereign state
const Q_HISTSTATE = '?item wdt:P31/wdt:P279* wd:Q3024240.';     // historical country
const Q_SPORT     = '?item wdt:P31/wdt:P279* wd:Q13406554.';    // sports competition
const Q_ORG       = '?item wdt:P31/wdt:P279* wd:Q43229.';       // organization

const QUERY_GROUPS = [
  // People — date-first (humans are far too numerous to enter class-first). The
  // P569/P570 date index makes these branches cheap (~4s), so the limit is set
  // generously: ranking still floats the headliners up, but regionally-notable
  // figures (e.g. Uthman dan Fodio, b.1754, ~16th by sitelinks) aren't clipped.
  { branches: [
    { category: 'birth', dateProps: ['P569'], classTriple: Q_HUMAN, limit: 30 },
    { category: 'death', dateProps: ['P570'], classTriple: Q_HUMAN, limit: 30 },
  ] },
  // Conflicts (P580 start time etc.) + country foundings & independences (P571
  // inception) — all small classes, so class-first. Inceptions are tagged as
  // Events (the "independence / founding" sense lives within Events). Two state
  // classes are queried as *separate* branches, not one P31/P279* disjunction:
  // a VALUES disjunction over the subclass path defeats the class index and the
  // 1960 query blows out to ~21s, whereas the two branches run in ~2s + ~1s.
  // The historical-country branch is what surfaces newly-independent states that
  // model their independence on a transitional item rather than the modern one —
  // e.g. 1960 Nigerian independence lives on "Federation of Nigeria" (a
  // historical country), not the modern Nigeria item (whose P571 is 1963).
  { branches: [
    { category: 'war',   dateProps: ['P580', 'P585', 'P582'], classTriple: Q_WAR,       classFirst: true, limit: 15 },
    { category: 'event', dateProps: ['P571'],                 classTriple: Q_STATE,     classFirst: true, limit: 25 },
    { category: 'event', dateProps: ['P571'],                 classTriple: Q_HISTSTATE, classFirst: true, limit: 15 },
  ] },
  // Sporting events (World Cups, Olympics, …). Isolated, and given a tight
  // timeout: ranking by sitelinks (what surfaces the headline event over the
  // hundreds of minor ones) is a full sort whose cost swings with how busy the
  // sporting year was. On a heavy year it would blow the budget, so we let it
  // bail early and degrade to "no sports this year" rather than stall the whole
  // response — every other category is unaffected.
  { branches: [
    { category: 'event', dateProps: ['P585', 'P580'], classTriple: Q_SPORT, classFirst: true, minSitelinks: 8, limit: 12 },
  ], timeoutMs: 24_000 },
  // Creations: publications (P577) and discoveries/inventions (P575) need no
  // class test to be meaningful; organizations (P571) use the nested strategy.
  // Thresholds are lowered and limits raised so moderately-notable works pass
  // (ranking still surfaces the headliners first). The org nested subquery widens
  // its high-sitelink pre-cut to 120 so more candidates reach the class test.
  { branches: [
    { category: 'publication',  dateProps: ['P577'], minSitelinks: 8, limit: 15 },
    { category: 'discovery',    dateProps: ['P575'], limit: 12 },
    { category: 'organization', dateProps: ['P571'], classTriple: Q_ORG, nested: true, minSitelinks: 12, nestedLimit: 120, limit: 12 },
  ] },
];

/** Categories a binding's ?cat may carry; anything else falls back to 'other'. */
const VALID_CATEGORIES = new Set([
  'birth', 'death', 'event', 'organization', 'publication', 'war', 'discovery', 'other',
]);

/** Dedup precedence when one QID surfaces under several categories (lower wins).
 *  'event' is the most generic, so a more specific sense always overrides it. */
const CATEGORY_PRIORITY = {
  war: 0, birth: 1, death: 2, organization: 3, publication: 4, discovery: 5, event: 6, other: 7,
};

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
async function runSparqlQuery(sparql, timeoutMs = 28_000) {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set('query', sparql);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/sparql-results+json',
      // Wikidata requests a descriptive User-Agent
      'User-Agent': 'Chronograph/1.0 (https://github.com/chronograph; contact@example.com)',
    },
    // Fail fast instead of letting one slow query hold the whole response. Kept
    // under the frontend's 30s axios timeout.
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Wikidata SPARQL error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

/**
 * Converts a raw SPARQL result binding into a HistoricalEvent object. The
 * category is read from the row's ?cat tag, set by the branch that produced it.
 *
 * @param {object} binding - One row from results.bindings
 * @param {number} year    - The requested year (integer)
 */
function normaliseBinding(binding, year) {
  const itemUri = binding.item?.value ?? '';
  const wikidataId = extractWikidataId(itemUri);

  const rawCat   = binding.cat?.value ?? 'other';
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'other';

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
 * Fetches one query group and returns its normalised HistoricalEvent objects
 * plus an `ok` flag, so the handler can avoid CDN-caching degraded responses.
 */
async function fetchGroup(query, year, timeoutMs) {
  try {
    const data = await runSparqlQuery(query, timeoutMs);
    const bindings = data?.results?.bindings ?? [];
    return { ok: true, items: bindings.map((b) => normaliseBinding(b, year)) };
  } catch (err) {
    // Surface the error as a console warning but don't crash the whole response
    console.error('[year.js] Failed to fetch a query group:', err.message);
    return { ok: false, items: [] };
  }
}

/**
 * Dedups events by QID across all groups, keeping the most specific category
 * when the same item arrived through more than one branch.
 */
function dedupeByQid(events) {
  const byId = new Map();
  for (const ev of events) {
    const existing = byId.get(ev.id);
    if (!existing || CATEGORY_PRIORITY[ev.category] < CATEGORY_PRIORITY[existing.category]) {
      byId.set(ev.id, ev);
    }
  }
  return [...byId.values()];
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

  // ── Parallel SPARQL fetches (one request per group) ───────────────────────
  const groups = await Promise.all(
    QUERY_GROUPS.map((group) =>
      fetchGroup(buildGroupQuery(year, group.branches), year, group.timeoutMs),
    ),
  );

  // Merge every group, then dedup across branches by QID.
  const results = dedupeByQid(groups.flatMap((g) => g.items));
  const allOk   = groups.every((g) => g.ok);

  // ── Cache & respond ───────────────────────────────────────────────────────
  // Only let the CDN cache complete responses; a degraded response (one or
  // more groups failed) must not be served for the next 24 hours.
  res.setHeader('Cache-Control', allOk ? 'public, max-age=86400' : 'no-store');
  return res.status(200).json(results);
}
