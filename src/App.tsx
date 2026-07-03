import { useEffect, useMemo, useReducer, useRef } from 'react';
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
import { ALL_CATEGORIES } from './constants/categories';
import { fetchYearEvents } from './api/yearApi';
import { enrichEvents } from './services/wikidataEnrichment';
import { selectRenderSlice } from './utils/tiering';
import { formatYear } from './utils/year';
import type { HistoricalEvent, EventCategory } from './types';
import './App.css';

// ── State / reducer ───────────────────────────────────────────────────────────

type AppView = 'yearMap' | 'yearDetail';

interface AppState {
  view:             AppView;
  selectedYear:     number | null;
  pendingYear:      number | null;
  visitedYears:     Set<number>;
  /** The full deep pool for the current year, held in memory; only a tiered
   *  slice is rendered. Raw from the API (titles start as QIDs). */
  pool:             HistoricalEvent[];
  /** Per-year enrichment cache, keyed by QID — grows as tiers are revealed and
   *  their labels/descriptions are resolved lazily. Reset on each new year. */
  enrichedById:     Record<string, HistoricalEvent>;
  loading:          boolean;
  error:            string | null;
  selectedEvent:    HistoricalEvent | null;
  activeCategories: Set<EventCategory>;
}

type AppAction =
  | { type: 'SEARCH_START';   year: number }
  | { type: 'SEARCH_SUCCESS'; year: number; pool: HistoricalEvent[]; enrichedById: Record<string, HistoricalEvent> }
  | { type: 'SEARCH_ERROR' }
  | { type: 'MERGE_ENRICH';   items: HistoricalEvent[] }
  | { type: 'SHOW_MAP' }
  | { type: 'SELECT_EVENT';   event: HistoricalEvent | null }
  | { type: 'SET_CATEGORIES'; categories: Set<EventCategory> };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SEARCH_START':
      return { ...state, pendingYear: action.year, loading: true, error: null, selectedEvent: null };
    case 'SEARCH_SUCCESS': {
      return {
        ...state,
        view:         'yearDetail',
        pendingYear:  null,
        loading:      false,
        selectedYear: action.year,
        pool:         action.pool,
        enrichedById: action.enrichedById, // fresh cache seeded with the first skim
        // The map lays years out deterministically, so opening one only needs
        // to be remembered as visited (highlighted, and flown to on return).
        visitedYears: state.visitedYears.has(action.year)
          ? state.visitedYears
          : new Set(state.visitedYears).add(action.year),
      };
    }
    case 'SEARCH_ERROR':
      return { ...state, pendingYear: null, loading: false, error: 'Could not load data for this year. Try another.' };
    case 'MERGE_ENRICH': {
      // Fold newly-resolved nodes into the per-year cache (drill-in reveal).
      const next = { ...state.enrichedById };
      for (const e of action.items) next[e.id] = e;
      return { ...state, enrichedById: next };
    }
    case 'SHOW_MAP':
      // Node expansion around the visited year happens inside YearMap itself
      // (driven by the lastVisitedYear prop), directly in the live simulation.
      return { ...state, view: 'yearMap', selectedYear: null, selectedEvent: null, error: null };
    case 'SELECT_EVENT':
      return { ...state, selectedEvent: action.event };
    case 'SET_CATEGORIES':
      return { ...state, activeCategories: action.categories };
  }
}

const initialState: AppState = {
  view:             'yearMap',
  selectedYear:     null,
  pendingYear:      null,
  visitedYears:     new Set<number>(),
  pool:             [],
  enrichedById:     {},
  loading:          false,
  error:            null,
  selectedEvent:    null,
  activeCategories: new Set(ALL_CATEGORIES),
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { enabled: audioOn, toggle: toggleAudio } = useAmbientAudio();
  const {
    view, selectedYear, pendingYear, visitedYears,
    pool, enrichedById, loading, error, selectedEvent, activeCategories,
  } = state;

  const isDetail = view === 'yearDetail' && selectedYear !== null;

  // The tiered slice actually rendered, and that slice with its resolved labels
  // projected on. Both memoised so unrelated re-renders don't reshuffle nodes.
  const renderSlice = useMemo(
    () => selectRenderSlice(pool, activeCategories),
    [pool, activeCategories],
  );
  // Project resolved labels onto the slice, then drop any item that enrichment
  // has already tried and left with nothing but its QID — so a bare "Q12345"
  // never renders as a clickable node that opens an empty card. Items not yet
  // enriched (title still a QID placeholder) are kept; they resolve shortly.
  const renderedEvents = useMemo(
    () => renderSlice
      .map(e => enrichedById[e.id] ?? e)
      .filter(e => !(enrichedById[e.id] && /^Q\d+$/.test(e.title))),
    [renderSlice, enrichedById],
  );

  // Keep the live active-filter set in a ref so the initial-skim enrichment in
  // handleSearch (which runs before the state settles) tiers on the current set.
  const activeRef = useRef(activeCategories);
  useEffect(() => { activeRef.current = activeCategories; }, [activeCategories]);

  // Sets iterate in insertion order, so the last entry is the most recent visit
  let lastVisitedYear: number | null = null;
  for (const y of visitedYears) lastVisitedYear = y;

  async function handleSearch(year: number) {
    if (loading) return;
    dispatch({ type: 'SEARCH_START', year });
    try {
      const rawPool = await fetchYearEvents(year);
      // Enrich only the first rendered slice (the ~60 skim), so first paint is
      // fast regardless of pool depth. Enrichment never throws, but guard anyway.
      const skim = selectRenderSlice(rawPool, activeRef.current);
      const enrichedSkim = await enrichEvents(skim).catch(() => skim);
      const seed: Record<string, HistoricalEvent> = {};
      for (const e of enrichedSkim) seed[e.id] = e;
      dispatch({ type: 'SEARCH_SUCCESS', year, pool: rawPool, enrichedById: seed });
    } catch {
      dispatch({ type: 'SEARCH_ERROR' });
    }
  }

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

  /** Step chronologically by one year, skipping the non-existent year 0. */
  function stepYear(delta: number) {
    if (selectedYear === null || loading) return;
    let target = selectedYear + delta;
    if (target === 0) target += delta;
    handleSearch(target);
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
    handleSearch(target);
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
  }, [isDetail, selectedYear, loading]);

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
            onYearSelect={handleSearch}
          />

          {/* Map header — brand (left), search (centre / its own row on mobile),
              sound + theme grouped (right). Wraps so nothing overlaps. */}
          <header className="chrono-map-top">
            <div className="chrono-brand">
              <SpiralMark variant="mini" className="chrono-brand-mark" />
              <span className="chrono-brand-label display">Chronograph</span>
            </div>

            <SearchBar mode="map" onSearch={handleSearch} />

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
                onClick={() => dispatch({ type: 'SHOW_MAP' })}
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

              <SearchBar mode="graph" onSearch={handleSearch} />

              <div className="chrono-detail-header-right">
                <LuckyButton onClick={handleLucky} disabled={loading} />
                <AudioToggle enabled={audioOn} onToggle={toggleAudio} />
                <ThemeToggle />
              </div>
            </header>

            <CategoryFilter
              active={activeCategories}
              onChange={categories => dispatch({ type: 'SET_CATEGORIES', categories })}
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
