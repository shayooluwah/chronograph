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

/**
 * Convert the app's *historical* year (no year 0; −1 = 1 BCE, −44 = 44 BCE) to
 * the *astronomical* numbering Wikidata/XSD store dates in (1 BCE = year 0, so
 * 44 BCE = −43). Positive years are unchanged; every BCE year shifts up by one.
 *
 * Without this, a query for "44 BC" (historical −44) would build the ISO year
 * −0044 and actually match 45 BCE, silently returning the wrong year's events.
 */
function toAstronomicalYear(historicalYear) {
  return historicalYear < 0 ? historicalYear + 1 : historicalYear;
}

/** ISO dateTime for Jan 1 of an astronomical year (may be 0 or negative). */
function isoYearStart(astroYear) {
  const abs = String(Math.abs(astroYear)).padStart(4, '0');
  return `${astroYear < 0 ? '-' : ''}${abs}-01-01T00:00:00Z`;
}

/** [start, end) xsd:dateTime bounds covering exactly one historical year. */
function yearBounds(historicalYear) {
  // Map to astronomical numbering first; the year after −1 (1 BCE) is 0, and
  // the year after historical −1 is historical +1 (1 CE) — both contiguous here.
  const astro = toAstronomicalYear(historicalYear);
  return [isoYearStart(astro), isoYearStart(astro + 1)];
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
 * Assembles a group of branches into one query: just the UNION of their ranked
 * subqueries, carrying each row's QID, category tag and sitelink count.
 *
 * Deliberately lightweight: no `wikibase:label` service and no Wikipedia-article
 * join. Those ran per-row over the whole merged set and were the main cost that
 * forced the small per-branch caps — yet the label service returns nothing
 * usable here anyway (its auto-label is disabled in "manual mode"), so titles
 * came back as bare QIDs regardless. The client resolves labels, descriptions
 * and links lazily (wbgetentities) for only the nodes it actually renders, which
 * is what lets these branches return deep, notability-ranked pools affordably.
 * `?sl` (sitelink count) is surfaced so the client can rank/slice per category.
 */
function buildGroupQuery(year, branches) {
  const [start, end] = yearBounds(year);
  const union = branches.map((b) => buildBranch(b, start, end)).join('\n  UNION\n');
  return `
SELECT DISTINCT ?item ?cat ?sl WHERE {
${union}
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
const Q_LITERARY  = '?item wdt:P31/wdt:P279* wd:Q7725634.';     // literary work — books/novels/plays only

// Media classes — film, games, albums and paintings. Each is queried as its own
// class-first branch (a VALUES disjunction over the subclass path would defeat
// the class index, as with the two state classes above). Deliberately narrow:
// broad abstract classes (musical work, "visual artwork") enumerate a huge
// subtree and blow the time budget, so we use the concrete high-signal classes.
const Q_FILM      = '?item wdt:P31/wdt:P279* wd:Q11424.';       // film
const Q_GAME      = '?item wdt:P31/wdt:P279* wd:Q7889.';        // video game
const Q_ALBUM     = '?item wdt:P31/wdt:P279* wd:Q482994.';      // album (covers notable music)
const Q_PAINTING  = '?item wdt:P31/wdt:P279* wd:Q3305213.';     // painting

// Per-branch `limit` is now a safety cap against pathological payloads, NOT a
// notability trim: each branch returns as deep a sitelink-ranked pool as its
// time budget allows, and the client tiers what it renders. Cheap date-indexed
// branches (births, deaths, publications, discoveries) go deep (~250); branches
// gated by an expensive class path (states, sports, orgs) stay smaller and lean
// on the per-group timeout to degrade gracefully rather than stall.
const DEEP_LIMIT = 250; // cheap, date-indexed branches
const QUERY_GROUPS = [
  // People — date-first (humans are far too numerous to enter class-first). The
  // P569/P570 date index makes these branches cheap, so they return a deep pool;
  // the client renders only a slice. Ranking still floats the headliners up.
  { branches: [
    { category: 'birth', dateProps: ['P569'], classTriple: Q_HUMAN, limit: DEEP_LIMIT },
    { category: 'death', dateProps: ['P570'], classTriple: Q_HUMAN, limit: DEEP_LIMIT },
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
  // These classes are naturally small, so the caps are generous safety limits.
  { branches: [
    { category: 'war',   dateProps: ['P580', 'P585', 'P582'], classTriple: Q_WAR,       classFirst: true, limit: 80 },
    { category: 'event', dateProps: ['P571'],                 classTriple: Q_STATE,     classFirst: true, limit: 80 },
    { category: 'event', dateProps: ['P571'],                 classTriple: Q_HISTSTATE, classFirst: true, limit: 50 },
  ] },
  // Sporting events (World Cups, Olympics, …). Isolated, and given a tight
  // timeout: ranking by sitelinks (what surfaces the headline event over the
  // hundreds of minor ones) is a full sort whose cost swings with how busy the
  // sporting year was. On a heavy year it would blow the budget, so we let it
  // bail early and degrade to "no sports this year" rather than stall the whole
  // response — every other category is unaffected. Stays bounded for speed.
  { branches: [
    { category: 'event', dateProps: ['P585', 'P580'], classTriple: Q_SPORT, classFirst: true, minSitelinks: 8, limit: 40 },
  ], timeoutMs: 24_000 },
  // Creations: publications (P577) and discoveries/inventions (P575). Publications
  // are narrowed to *literary* works — books, novels, plays — via the nested
  // strategy (a high-sitelink pre-cut over the P577 range, then the literary-work
  // class test), so films/albums/games/software (which also carry a P577
  // publication date) are NOT swept in here; media types surface under 'media'.
  // Discoveries need no class test. Organizations (P571) use the same nested
  // strategy (pre-cut, then the expensive org class path) to stay bounded.
  { branches: [
    { category: 'publication',  dateProps: ['P577'], classTriple: Q_LITERARY, nested: true, minSitelinks: 8, nestedLimit: 250, limit: DEEP_LIMIT },
    { category: 'discovery',    dateProps: ['P575'], limit: 200 },
    { category: 'organization', dateProps: ['P571'], classTriple: Q_ORG, nested: true, minSitelinks: 12, nestedLimit: 150, limit: 60 },
  ] },
  // Media splits into THREE isolated requests rather than one, because each media
  // class is an expensive P279* subtree enumeration and stacking them in a single
  // query blows the time budget (and one slow branch would empty the whole group).
  // Split this way every branch stays comfortably under its timeout and degrades
  // independently (like sports): a slow year loses at most one media flavour.
  //
  // Films + games — release date (P577), the highest-value modern media.
  { branches: [
    { category: 'media', dateProps: ['P577'], classTriple: Q_FILM, classFirst: true, minSitelinks: 4, limit: 60 },
    { category: 'media', dateProps: ['P577'], classTriple: Q_GAME, classFirst: true, minSitelinks: 3, limit: 40 },
  ], timeoutMs: 22_000 },
  // Music albums — release date (P577). Its own request so the film/game class
  // enumeration can't drag it over budget.
  { branches: [
    { category: 'media', dateProps: ['P577'], classTriple: Q_ALBUM, classFirst: true, minSitelinks: 4, limit: 40 },
  ], timeoutMs: 20_000 },
  // Paintings — inception (P571). The P571 scan is costly and low-yield for
  // modern years, so it is isolated with a tight timeout and degrades to "no
  // paintings" gracefully; either way paintings no longer land under Publications.
  { branches: [
    { category: 'media', dateProps: ['P571'], classTriple: Q_PAINTING, classFirst: true, minSitelinks: 4, limit: 40 },
  ], timeoutMs: 20_000 },
  // Catch-all — a broad P571 (inception) scan with no class test, tagged 'other'
  // (the lowest dedup priority). Anything a named branch also matched keeps its
  // named sense (states → event, orgs → organization win the QID dedup), so only
  // genuinely uncategorised inceptions remain here: buildings & structures,
  // artworks, monuments, ships, bridges, vehicles, software, places founded,
  // treaties, etc. Sitelink-thresholded like publications so it early-terminates,
  // and given its own request so it doesn't stack with the org P571 scan above.
  { branches: [
    { category: 'other', dateProps: ['P571'], minSitelinks: 15, limit: DEEP_LIMIT },
  ] },
];

/** Categories a binding's ?cat may carry; anything else falls back to 'other'. */
const VALID_CATEGORIES = new Set([
  'birth', 'death', 'event', 'organization', 'publication', 'media', 'war', 'discovery', 'other',
]);

/** Dedup precedence when one QID surfaces under several categories (lower wins).
 *  'event' is the most generic, so a more specific sense always overrides it.
 *  'media' outranks 'publication' so anything typed as a film/album/game/artwork
 *  lands under Media even if it also carries a publication date. */
const CATEGORY_PRIORITY = {
  war: 0, birth: 1, death: 2, organization: 3, media: 4, publication: 5, discovery: 6, event: 7, other: 8,
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
      // Wikimedia UA policy requires a descriptive agent with a real contact
      // point — a placeholder risks WDQS throttling/blocking us at real traffic.
      'User-Agent': 'Chronograph/1.0 (+https://github.com/shayooluwah/chronograph)',
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
 * category is read from the row's ?cat tag and the sitelink count from ?sl (the
 * notability rank the client sorts/slices on). The title starts as the QID —
 * the client resolves the human-readable label lazily when the node is rendered.
 *
 * @param {object} binding - One row from results.bindings
 * @param {number} year    - The requested year (integer)
 */
function normaliseBinding(binding, year) {
  const itemUri = binding.item?.value ?? '';
  const wikidataId = extractWikidataId(itemUri);

  const rawCat   = binding.cat?.value ?? 'other';
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'other';

  const sitelinks = Number(binding.sl?.value ?? 0);

  return {
    id: wikidataId,
    title: wikidataId,   // placeholder; resolved client-side on render
    description: '',
    year,
    category,
    wikidataId,
    sitelinks,
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
  // Strict: a single, purely-numeric integer (parseInt would accept "1894abc",
  // "1e300" and arrays), clamped to a range that covers all plausible history.
  // Every request fans out to several WDQS queries, so junk input must die here
  // rather than burn Wikidata's (and our) time budget.
  const rawYear = req.query?.year;
  if (typeof rawYear !== 'string' || !/^-?\d{1,6}$/.test(rawYear)) {
    return res.status(400).json({ error: 'Missing or invalid "year" query parameter.' });
  }
  const year = parseInt(rawYear, 10);
  if (year === 0 || year < -100000 || year > 100000) {
    return res.status(400).json({ error: '"year" out of supported range.' });
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
  // Only cache complete responses; a degraded response (one or more groups
  // failed) must not be served for the next 24 hours. `s-maxage` lets Vercel's
  // CDN absorb repeat traffic for a year across *all* users (each uncached hit
  // fans out to several WDQS queries, so shared caching is also abuse damping);
  // `max-age` keeps the browser cache for the individual user.
  res.setHeader(
    'Cache-Control',
    allOk ? 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400' : 'no-store',
  );
  return res.status(200).json(results);
}
