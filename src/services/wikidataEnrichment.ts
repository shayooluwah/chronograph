import type { HistoricalEvent } from '../types';

/**
 * Wikidata enrichment service.
 *
 * The SPARQL query in api/year.js returns events keyed by Wikidata QID, but its
 * label/description resolution (the `wikibase:label` service) is unreliable —
 * under load it can time out or return bare QIDs. This module resolves
 * human-readable labels, descriptions and Wikipedia links in a separate, more
 * robust step using the Wikidata Action API (`wbgetentities`), with a Wikipedia
 * summary fallback for entities that have no Wikidata description.
 *
 * Everything here degrades gracefully: any network/parse failure leaves the
 * affected events with whatever the SPARQL step already provided (label falls
 * back to the QID), so the app never crashes or renders empty nodes.
 */

const WBGETENTITIES_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_SUMMARY_API  = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

/** Max entity ids the wbgetentities endpoint accepts per request. */
const BATCH_SIZE = 50;

/** Wikipedia extracts are full paragraphs; trim them to a card-sized blurb. */
const DESCRIPTION_MAX = 150;

/** Entity labels/descriptions change rarely, so they get a much longer TTL
 *  than the year-based SPARQL response cache. Stored in localStorage so it
 *  survives reloads. */
const CACHE_PREFIX = 'wd-enrich:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedEntity {
  label?:          string;
  description?:    string;
  wikipediaTitle?: string;
  wikipediaUrl?:   string;
}

interface CacheEntry extends EnrichedEntity {
  ts: number;
}

// ── localStorage cache (per-QID, 7-day TTL) ───────────────────────────────────

function readCache(qid: string): EnrichedEntity | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + qid);
    if (!raw) return null;
    const { ts, ...data } = JSON.parse(raw) as CacheEntry;
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + qid);
      return null;
    }
    return data;
  } catch {
    return null; // private mode, corrupt JSON, etc.
  }
}

function writeCache(qid: string, data: EnrichedEntity): void {
  try {
    localStorage.setItem(CACHE_PREFIX + qid, JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    // Quota exceeded or storage unavailable — caching is best-effort only.
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** Build a canonical article URL from an enwiki sitelink title. */
function wikipediaUrlFromTitle(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

// ── Wikidata Action API ───────────────────────────────────────────────────────

/** Minimal shape of the wbgetentities response fields we read. */
interface WbEntity {
  missing?:   string;
  labels?:       { en?: { value?: string } };
  descriptions?: { en?: { value?: string } };
  sitelinks?:    { enwiki?: { title?: string } };
}

/**
 * Resolves one batch of QIDs (≤ 50) via wbgetentities. `origin=*` enables an
 * anonymous CORS request straight from the browser.
 */
async function fetchEntitiesBatch(qids: string[]): Promise<Record<string, EnrichedEntity>> {
  const url = new URL(WBGETENTITIES_ENDPOINT);
  url.searchParams.set('action',     'wbgetentities');
  url.searchParams.set('ids',        qids.join('|'));
  url.searchParams.set('props',      'labels|descriptions|sitelinks');
  url.searchParams.set('languages',  'en');
  url.searchParams.set('sitefilter', 'enwiki');
  url.searchParams.set('format',     'json');
  url.searchParams.set('origin',     '*');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`wbgetentities ${res.status}`);

  const json = await res.json();
  const entities: Record<string, WbEntity> = json?.entities ?? {};
  const out: Record<string, EnrichedEntity> = {};

  for (const [qid, ent] of Object.entries(entities)) {
    if (ent?.missing !== undefined) continue;
    const wikipediaTitle = ent?.sitelinks?.enwiki?.title;
    out[qid] = {
      label:          ent?.labels?.en?.value,
      description:    ent?.descriptions?.en?.value,
      wikipediaTitle,
      wikipediaUrl:   wikipediaTitle ? wikipediaUrlFromTitle(wikipediaTitle) : undefined,
    };
  }
  return out;
}

/** Fetches a Wikipedia summary extract, truncated to a card-sized blurb. */
async function fetchWikipediaExtract(title: string): Promise<string | undefined> {
  try {
    const res = await fetch(WIKIPEDIA_SUMMARY_API + encodeURIComponent(title));
    if (!res.ok) return undefined;
    const json = await res.json();
    const extract: string | undefined = json?.extract;
    return extract ? truncate(extract, DESCRIPTION_MAX) : undefined;
  } catch {
    return undefined;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a copy of `events` with `title`, `description` and `wikipediaUrl`
 * resolved from Wikidata (with a Wikipedia summary fallback for missing
 * descriptions). Events whose entity could not be resolved are returned
 * unchanged, so callers can render them as-is.
 *
 * Never throws: enrichment is purely additive and any failure degrades to the
 * original SPARQL data.
 */
export async function enrichEvents(events: HistoricalEvent[]): Promise<HistoricalEvent[]> {
  if (events.length === 0) return events;

  const qids = [...new Set(
    events.map(e => e.wikidataId).filter(q => /^Q\d+$/.test(q)),
  )];
  if (qids.length === 0) return events;

  const resolved = new Map<string, EnrichedEntity>();

  // 1. Serve what we can from the long-lived cache.
  const uncached: string[] = [];
  for (const qid of qids) {
    const cached = readCache(qid);
    if (cached) resolved.set(qid, cached);
    else uncached.push(qid);
  }

  // 2. Resolve the rest via wbgetentities, batched at the API's 50-id limit.
  //    Each batch fails independently so one bad request can't blank the rest.
  const batchMaps = await Promise.all(
    chunk(uncached, BATCH_SIZE).map(batch =>
      fetchEntitiesBatch(batch).catch(() => ({} as Record<string, EnrichedEntity>)),
    ),
  );
  for (const map of batchMaps) {
    for (const [qid, data] of Object.entries(map)) resolved.set(qid, data);
  }

  // 3. Wikipedia fallback for entities with a sitelink but no Wikidata description.
  const needExtract = [...resolved.entries()]
    .filter(([, d]) => !d.description?.trim() && d.wikipediaTitle);
  await Promise.all(needExtract.map(async ([qid, d]) => {
    const extract = await fetchWikipediaExtract(d.wikipediaTitle!);
    if (extract) resolved.set(qid, { ...d, description: extract });
  }));

  // 4. Persist freshly-resolved entities (cached ones are already stored).
  for (const qid of uncached) {
    const data = resolved.get(qid);
    if (data) writeCache(qid, data);
  }

  // 5. Project the resolved fields onto the events, keeping SPARQL data as the
  //    fallback so an unresolved entity still renders its existing title.
  return events.map(e => {
    const d = resolved.get(e.wikidataId);
    if (!d) return e;
    return {
      ...e,
      title:       d.label?.trim()       || e.title,
      description: d.description?.trim()  || e.description,
      ...(d.wikipediaUrl ? { wikipediaUrl: d.wikipediaUrl } : {}),
    };
  });
}
