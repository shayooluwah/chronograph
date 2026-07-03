import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import SearchBar       from './components/SearchBar';
import YearMap         from './components/YearMap';
import Graph           from './components/Graph';
import EventPanel      from './components/EventPanel';
import CategoryFilter  from './components/CategoryFilter';
import SpiralMark      from './components/SpiralMark';
import Backdrop        from './components/Backdrop';
import ThemeToggle     from './components/ThemeToggle';
import AudioToggle     from './components/AudioToggle';
import LuckyButton     from './components/LuckyButton';
import TourOverlay     from './components/TourOverlay';
import { useAmbientAudio } from './hooks/useAmbientAudio';
import { categorySlugsSegment, parseCategorySlugs } from './constants/categories';
import { fetchYearEvents } from './api/yearApi';
import { enrichEvents } from './services/wikidataEnrichment';
import { selectRenderSlice } from './utils/tiering';
import { formatYear, parseYearSlug } from './utils/year';
import type { HistoricalEvent, EventCategory } from './types';
import './App.css';

// ── URL helpers ─────────────────────────────────────────────────────────────
//
// The URL is the source of truth for (year, active filters). `yearPath` builds
// the canonical link for a year + filter set: a bare `/:year` when all
// categories are active, otherwise `/:year/:slugs` with alphabetically-sorted
// slugs (see categorySlugsSegment), so the same filter set always shares alike.
function yearPath(year: number, active: Set<EventCategory>): string {
  const seg = categorySlugsSegment(active);
  return seg ? `/${year}/${seg}` : `/${year}`;
}

// ── State / reducer ───────────────────────────────────────────────────────────
//
// The reducer now owns only the *data* for the current year (the fetched pool,
// lazy-enrichment cache, load/error status, the open event). The current year
// and active filters live in the URL, read via useParams below — not here.

interface AppState {
  pendingYear:   number | null;
  visitedYears:  Set<number>;
  /** The full deep pool for the current year, held in memory; only a tiered
   *  slice is rendered. Raw from the API (titles start as QIDs). */
  pool:          HistoricalEvent[];
  /** Per-year enrichment cache, keyed by QID — grows as tiers are revealed and
   *  their labels/descriptions are resolved lazily. Reset on each new year. */
  enrichedById:  Record<string, HistoricalEvent>;
  loading:       boolean;
  error:         string | null;
  selectedEvent: HistoricalEvent | null;
}

type AppAction =
  | { type: 'FETCH_START';   year: number }
  | { type: 'FETCH_SUCCESS'; year: number; pool: HistoricalEvent[]; enrichedById: Record<string, HistoricalEvent> }
  | { type: 'FETCH_ERROR' }
  | { type: 'MERGE_ENRICH';  items: HistoricalEvent[] }
  | { type: 'SELECT_EVENT';  event: HistoricalEvent | null }
  | { type: 'CLOSE_DETAIL' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, pendingYear: action.year, loading: true, error: null, selectedEvent: null };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        pendingYear:  null,
        loading:      false,
        pool:         action.pool,
        enrichedById: action.enrichedById, // fresh cache seeded with the first skim
        // The map lays years out deterministically, so opening one only needs
        // to be remembered as visited (highlighted, and flown to on return).
        visitedYears: state.visitedYears.has(action.year)
          ? state.visitedYears
          : new Set(state.visitedYears).add(action.year),
      };
    case 'FETCH_ERROR':
      return { ...state, pendingYear: null, loading: false, error: 'Could not load data for this year. Try another.' };
    case 'MERGE_ENRICH': {
      // Fold newly-resolved nodes into the per-year cache (drill-in reveal).
      const next = { ...state.enrichedById };
      for (const e of action.items) next[e.id] = e;
      return { ...state, enrichedById: next };
    }
    case 'SELECT_EVENT':
      return { ...state, selectedEvent: action.event };
    case 'CLOSE_DETAIL':
      return { ...state, selectedEvent: null, error: null };
  }
}

const initialState: AppState = {
  pendingYear:   null,
  visitedYears:  new Set<number>(),
  pool:          [],
  enrichedById:  {},
  loading:       false,
  error:         null,
  selectedEvent: null,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const params   = useParams();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { enabled: audioOn, toggle: toggleAudio } = useAmbientAudio();
  const { pendingYear, visitedYears, pool, enrichedById, loading, error, selectedEvent } = state;

  // ── Year + filters, read straight from the URL ────────────────────────────
  const rawYear      = params.year;
  const selectedYear = rawYear != null ? parseYearSlug(rawYear) : null;
  const invalidYear  = rawYear != null && selectedYear === null;
  const isDetail     = selectedYear !== null;

  // Active filters derive from the URL segment; unknown slugs fall back to all.
  const activeCategories = useMemo(
    () => parseCategorySlugs(params.categories),
    [params.categories],
  );

  // The tiered slice actually rendered, and that slice with its resolved labels
  // projected on. Both memoised so unrelated re-renders don't reshuffle nodes.
  const renderSlice = useMemo(
    () => selectRenderSlice(pool, activeCategories),
    [pool, activeCategories],
  );
  // Drop items enrichment has tried and left as a bare QID so they never render
  // as clickable nodes that open an empty card; keep not-yet-enriched placeholders.
  const renderedEvents = useMemo(
    () => renderSlice
      .map(e => enrichedById[e.id] ?? e)
      .filter(e => !(enrichedById[e.id] && /^Q\d+$/.test(e.title))),
    [renderSlice, enrichedById],
  );

  // Keep the live active-filter set in a ref so the initial-skim enrichment in
  // the fetch effect (which intentionally does NOT re-run on filter changes)
  // tiers on the current set.
  const activeRef = useRef(activeCategories);
  useEffect(() => { activeRef.current = activeCategories; }, [activeCategories]);

  // Sets iterate in insertion order, so the last entry is the most recent visit
  let lastVisitedYear: number | null = null;
  for (const y of visitedYears) lastVisitedYear = y;

  // ── Fetch when the year in the URL changes ────────────────────────────────
  // Keyed on the year only: toggling filters re-slices the pool in place and
  // never refetches. Hydrates directly from a deep-link / refresh with no map
  // flash (the detail scaffold + loading overlay show immediately).
  useEffect(() => {
    if (selectedYear === null) return;
    const controller = new AbortController();
    let cancelled = false;
    dispatch({ type: 'FETCH_START', year: selectedYear });
    (async () => {
      try {
        const rawPool = await fetchYearEvents(selectedYear, controller.signal);
        // Enrich only the first rendered slice (the ~60 skim), tiered on the
        // filters active at load time, so first paint is fast regardless of depth.
        const skim = selectRenderSlice(rawPool, activeRef.current);
        const enrichedSkim = await enrichEvents(skim).catch(() => skim);
        const seed: Record<string, HistoricalEvent> = {};
        for (const e of enrichedSkim) seed[e.id] = e;
        if (!cancelled) dispatch({ type: 'FETCH_SUCCESS', year: selectedYear, pool: rawPool, enrichedById: seed });
      } catch {
        if (!cancelled) dispatch({ type: 'FETCH_ERROR' });
      }
    })();
    // Abort the superseded request (year changed, or StrictMode remount) so it
    // can't land in the catch and flash a spurious error over the live fetch.
    return () => { cancelled = true; controller.abort(); };
  }, [selectedYear]);

  // Returning to the map (no year in the URL) closes any open card / error.
  useEffect(() => {
    if (selectedYear === null) dispatch({ type: 'CLOSE_DETAIL' });
  }, [selectedYear]);

  // Lazy enrichment: whenever the rendered slice grows past what's cached (a
  // drill-in / filter change), resolve just the newly-revealed nodes and fold
  // them into the per-year cache. Cached QIDs are skipped, so re-toggling a
  // category you've already opened costs no network.
  useEffect(() => {
    const missing = renderSlice.filter(e => !enrichedById[e.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    enrichEvents(missing)
      .then(items => { if (!cancelled) dispatch({ type: 'MERGE_ENRICH', items }); })
      .catch(() => { /* enrichment is additive; failures leave QID placeholders */ });
    return () => { cancelled = true; };
  }, [renderSlice, enrichedById]);

  // ── URL-writing navigation ────────────────────────────────────────────────

  /** Go to a year, preserving the current filter set. Pushes a history entry. */
  function goToYear(year: number) {
    navigate(yearPath(year, activeCategories));
  }

  /** Step chronologically by one year, skipping the non-existent year 0. */
  function stepYear(delta: number) {
    if (selectedYear === null || loading) return;
    let target = selectedYear + delta;
    if (target === 0) target += delta;
    goToYear(target);
  }

  /** "I'm feeling lucky" — a random year in [1 CE, this year], never the current
   *  one, loaded with the same travel transition as a normal search. */
  function handleLucky() {
    if (loading) return;
    const maxYear = new Date().getFullYear();
    let target = 1 + Math.floor(Math.random() * maxYear);
    while (target === selectedYear) { // avoid immediately repeating the current year
      target = 1 + Math.floor(Math.random() * maxYear);
    }
    goToYear(target);
  }

  /** Filter changes replace (not push) so toggling pills doesn't spam history. */
  function handleCategories(next: Set<EventCategory>) {
    if (selectedYear === null) return;
    navigate(yearPath(selectedYear, next), { replace: true });
  }

  // Left/right arrows step years while in the detail view (ignored while typing).
  useEffect(() => {
    if (!isDetail) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); stepYear(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepYear(1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetail, selectedYear, activeCategories, loading]);

  // A bad year segment (e.g. /abc) is not a real route — bounce to the map.
  if (invalidYear) return <Navigate to="/" replace />;

  return (
    <>
      {/* Theme-swapped texture (stars in dark, paper grain in light), behind all */}
      <Backdrop />

      {/* yearMap view — entry / navigation layer. Brand, theme toggle and the
          compact search panel all float over the map. */}
      {!isDetail && (
        <>
          <YearMap
            visitedYears={visitedYears}
            lastVisitedYear={lastVisitedYear}
            onYearSelect={goToYear}
          />

          {/* Map header — brand (left), search (centre / its own row on mobile),
              sound + theme grouped (right). Wraps so nothing overlaps. */}
          <header className="chrono-map-top">
            <div className="chrono-brand">
              <SpiralMark variant="mini" className="chrono-brand-mark" />
              <span className="chrono-brand-label display">Chronograph</span>
            </div>

            <SearchBar mode="map" onSearch={goToYear} />

            <div className="chrono-map-controls">
              <LuckyButton onClick={handleLucky} disabled={loading} />
              <AudioToggle enabled={audioOn} onToggle={toggleAudio} />
              <ThemeToggle />
            </div>
          </header>
        </>
      )}

      {/* yearDetail view — a flow column (header + filter, then the graph stage)
          so the layout reflows cleanly as the header wraps on narrow screens. */}
      {isDetail && selectedYear !== null && (
        <div className="chrono-detail-view">
          <div className="chrono-top">
            <header className="chrono-detail-header">
              <button
                type="button"
                className="chrono-back-btn"
                onClick={() => navigate('/')}
              >
                ← Map
              </button>

              {/* Step through years (distinct from "← Map", which exits the view) */}
              <div className="chrono-year-nav">
                <button
                  type="button"
                  className="chrono-step-btn"
                  onClick={() => stepYear(-1)}
                  disabled={loading}
                  aria-label="Previous year"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <span className="chrono-detail-year display">{formatYear(selectedYear)}</span>
                <button
                  type="button"
                  className="chrono-step-btn"
                  onClick={() => stepYear(1)}
                  disabled={loading}
                  aria-label="Next year"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>

              <SearchBar mode="graph" onSearch={goToYear} />

              <div className="chrono-detail-header-right">
                <LuckyButton onClick={handleLucky} disabled={loading} />
                <AudioToggle enabled={audioOn} onToggle={toggleAudio} />
                <ThemeToggle />
              </div>
            </header>

            <CategoryFilter
              active={activeCategories}
              onChange={handleCategories}
            />
          </div>

          <div className="graph-container">
            <Graph
              events={renderedEvents}
              year={selectedYear}
              onEventSelect={event => dispatch({ type: 'SELECT_EVENT', event })}
            />

            {/* Event detail panel — overlays the graph stage (desktop drawer /
                mobile bottom sheet), beginning beneath the header + filter rows. */}
            <EventPanel
              event={selectedEvent}
              onClose={() => dispatch({ type: 'SELECT_EVENT', event: null })}
            />
          </div>
        </div>
      )}

      {/* Loading screen — only for the yearMap → yearDetail transition;
          navigating around the map itself never shows it */}
      {loading && pendingYear !== null && (
        <output
          className="chrono-loading"
          aria-label={`Loading data for ${pendingYear !== null ? formatYear(pendingYear) : 'that year'}`}
        >
          <Backdrop />
          <SpiralMark variant="loader" className="chrono-loading-mark" />
          <div className="chrono-loading-name display">Chronograph</div>
          <div className="chrono-loading-sub">
            Travelling to {pendingYear !== null ? formatYear(pendingYear) : 'the year'}<span className="chrono-dots" aria-hidden="true" />
          </div>
        </output>
      )}

      {/* API error banner */}
      {error && !loading && (
        <div
          role="alert"
          className="chrono-error-banner"
          style={{ top: isDetail ? '110px' : '80px' }}
        >
          {error}
        </div>
      )}

      {/* First-run onboarding walkthrough — self-contained; shows once per user */}
      <TourOverlay />
    </>
  );
}
