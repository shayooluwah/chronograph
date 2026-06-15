import { useEffect, useReducer } from 'react';
import type { HistoricalEvent } from '../types';

/**
 * Lazily fetches a fuller Wikipedia lead-paragraph summary for a single event,
 * on demand (when its card opens) — never for every node on year load. The
 * graph keeps relying on the lightweight per-node enrichment (label + short
 * Wikidata description); this is the richer body for the one clicked event.
 */
const SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const MAX_CHARS = 320;

/** Session cache by QID so reopening / re-clicking is instant. '' means "none". */
const cache = new Map<string, string>();

/**
 * Trim a lead paragraph to roughly the first two sentences: cut at a sentence
 * boundary, ~320 chars max, never mid-word, with an ellipsis only when trimmed.
 */
export function trimSummary(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // First up to two sentences (good enough for encyclopedic lead paragraphs).
  const sentences = clean.match(/[^.!?]+[.!?]+["'”’)\]]*/g);
  let out = sentences ? sentences.slice(0, 2).join('').trim() : clean;
  let trimmed = out.length < clean.length;

  if (out.length > MAX_CHARS) {
    const slice = out.slice(0, MAX_CHARS);
    const lastSpace = slice.lastIndexOf(' ');
    out = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).replace(/[\s.,;:—-]+$/, '');
    trimmed = true;
  }
  if (trimmed) out = out.replace(/[.\s]+$/, '') + '…';
  return out;
}

async function fetchSummary(title: string): Promise<string> {
  try {
    const res = await fetch(SUMMARY_API + encodeURIComponent(title));
    if (!res.ok) return '';
    const json = await res.json();
    return typeof json?.extract === 'string' ? trimSummary(json.extract) : '';
  } catch {
    return ''; // network/parse failure → no summary, card falls back gracefully
  }
}

export interface EventSummary {
  summary: string | null;
  loading: boolean;
}

export function useEventSummary(event: HistoricalEvent | null): EventSummary {
  // A bare counter to re-render once the async fetch lands; the summary itself
  // lives in the module cache, so state is derived during render below.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const qid   = event?.wikidataId ?? null;
  const title = event?.wikipediaTitle ?? null;

  // `undefined` → not yet fetched; otherwise the resolved value ('' = none).
  const cached = qid && cache.has(qid) ? cache.get(qid)! : undefined;
  const needsFetch = !!qid && !!title && cached === undefined;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    fetchSummary(title!).then(s => {
      cache.set(qid!, s);
      if (!cancelled) bump();
    });
    return () => { cancelled = true; };
  }, [needsFetch, qid, title]);

  if (cached !== undefined) return { summary: cached || null, loading: false };
  if (!qid || !title)       return { summary: null, loading: false };
  return { summary: null, loading: true }; // fetch in flight
}
