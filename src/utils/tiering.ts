import type { HistoricalEvent, EventCategory } from '../types';
import { ALL_CATEGORIES } from '../constants/categories';

/**
 * Progressive-disclosure tiering. The API returns a deep, sitelink-ranked pool
 * per year (hundreds of events); this picks the slice actually rendered on the
 * astrolabe, so the default view reads cleanly while drill-in reveals real depth.
 *
 * Tiers, by how many category filters are active:
 *   • all active (the default year view) → a balanced skim of ~SKIM_TOTAL,
 *     spread evenly across the categories present;
 *   • a narrowed subset (2..all-1)       → up to SUBSET_CAP, deeper per category;
 *   • a single category                  → essentially its whole pool.
 *
 * Distribution is round-robin, so each category contributes its most-notable
 * first and a category that runs out redistributes its share to the deeper pools.
 */

const SKIM_TOTAL = 60;  // all-view balanced skim
const SUBSET_CAP = 96;  // a narrowed subset expands toward full depth, still legible
const SINGLE_CAP = 200; // a single category shows essentially its entire pool

/** Group the active-category events, each list sorted most-notable-first. */
function poolByCategory(
  pool: HistoricalEvent[],
  active: Set<EventCategory>,
): Map<EventCategory, HistoricalEvent[]> {
  const map = new Map<EventCategory, HistoricalEvent[]>();
  for (const e of pool) {
    if (!active.has(e.category)) continue;
    let list = map.get(e.category);
    if (!list) { list = []; map.set(e.category, list); }
    list.push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (b.sitelinks ?? 0) - (a.sitelinks ?? 0));
  }
  return map;
}

/**
 * Returns the events to render for the current pool + active filters, ordered so
 * each category's most-notable come first (the astrolabe re-distributes them
 * angularly). Never mutates `pool`.
 */
export function selectRenderSlice(
  pool: HistoricalEvent[],
  active: Set<EventCategory>,
): HistoricalEvent[] {
  const byCat = poolByCategory(pool, active);
  const cats = [...byCat.keys()]; // only categories that actually have events
  if (cats.length === 0) return [];

  const target =
    active.size >= ALL_CATEGORIES.size ? SKIM_TOTAL   // all filters on → skim
    : cats.length === 1                ? SINGLE_CAP   // single category → full pool
    :                                    SUBSET_CAP;  // narrowed subset → deeper

  // Round-robin: draw one from each category per pass (top-ranked first). A
  // category that empties drops out, so its remaining share flows to the deeper
  // pools until we reach `target` or run out of events entirely.
  const cursors = new Map(cats.map(c => [c, 0]));
  const out: HistoricalEvent[] = [];
  let progressed = true;
  while (out.length < target && progressed) {
    progressed = false;
    for (const c of cats) {
      if (out.length >= target) break;
      const list = byCat.get(c)!;
      const i = cursors.get(c)!;
      if (i < list.length) {
        out.push(list[i]);
        cursors.set(c, i + 1);
        progressed = true;
      }
    }
  }
  return out;
}
