import { useReducer } from 'react';
import SearchBar       from './components/SearchBar';
import YearMap         from './components/YearMap';
import Graph           from './components/Graph';
import EventPanel      from './components/EventPanel';
import CategoryFilter  from './components/CategoryFilter';
import SpiralMark      from './components/SpiralMark';
import Backdrop        from './components/Backdrop';
import ThemeToggle     from './components/ThemeToggle';
import AudioToggle     from './components/AudioToggle';
import { useAmbientAudio } from './hooks/useAmbientAudio';
import { ALL_CATEGORIES } from './constants/categories';
import { fetchYearEvents } from './api/yearApi';
import { enrichEvents } from './services/wikidataEnrichment';
import type { HistoricalEvent, EventCategory } from './types';
import './App.css';

// ── State / reducer ───────────────────────────────────────────────────────────

type AppView = 'yearMap' | 'yearDetail';

interface AppState {
  view:             AppView;
  selectedYear:     number | null;
  pendingYear:      number | null;
  visitedYears:     Set<number>;
  events:           HistoricalEvent[];
  loading:          boolean;
  error:            string | null;
  selectedEvent:    HistoricalEvent | null;
  activeCategories: Set<EventCategory>;
}

type AppAction =
  | { type: 'SEARCH_START';   year: number }
  | { type: 'SEARCH_SUCCESS'; year: number; events: HistoricalEvent[] }
  | { type: 'SEARCH_ERROR' }
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
        events:       action.events,
        // The map lays years out deterministically, so opening one only needs
        // to be remembered as visited (highlighted, and flown to on return).
        visitedYears: state.visitedYears.has(action.year)
          ? state.visitedYears
          : new Set(state.visitedYears).add(action.year),
      };
    }
    case 'SEARCH_ERROR':
      return { ...state, pendingYear: null, loading: false, error: 'Could not load data for this year. Try another.' };
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
  events:           [],
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
    events, loading, error, selectedEvent, activeCategories,
  } = state;

  const isDetail       = view === 'yearDetail' && selectedYear !== null;
  const filteredEvents = events.filter(e => activeCategories.has(e.category));

  // Sets iterate in insertion order, so the last entry is the most recent visit
  let lastVisitedYear: number | null = null;
  for (const y of visitedYears) lastVisitedYear = y;

  async function handleSearch(year: number) {
    if (loading) return;
    dispatch({ type: 'SEARCH_START', year });
    try {
      const data = await fetchYearEvents(year);
      // Resolve readable labels/descriptions/links before rendering. Enrichment
      // never throws, but guard anyway so a bug there can't blank the year.
      const enriched = await enrichEvents(data).catch(() => data);
      dispatch({ type: 'SEARCH_SUCCESS', year, events: enriched });
    } catch {
      dispatch({ type: 'SEARCH_ERROR' });
    }
  }

  return (
    <>
      {/* Theme-swapped texture (stars in dark, paper grain in light), behind all */}
      <Backdrop />

      {/* yearMap view — entry / navigation layer. Brand, theme toggle and the
          compact search panel all float over the map. */}
      {!isDetail && (
        <>
          <div className="chrono-brand">
            <SpiralMark variant="mini" className="chrono-brand-mark" />
            <span className="chrono-brand-label display">chronograph</span>
          </div>
          <div className="chrono-map-controls">
            <AudioToggle enabled={audioOn} onToggle={toggleAudio} />
            <ThemeToggle />
          </div>
          <YearMap
            visitedYears={visitedYears}
            lastVisitedYear={lastVisitedYear}
            onYearSelect={handleSearch}
          />
          <SearchBar mode="map" onSearch={handleSearch} />
        </>
      )}

      {/* yearDetail view — a real flow header (no overlapping floats): back +
          year on the left, search in the middle, theme toggle on the right, with
          the category filter row stacked beneath on its own full-width line. */}
      {isDetail && selectedYear !== null && (
        <>
          <div className="chrono-top">
            <header className="chrono-detail-header">
              <div className="chrono-detail-header-left">
                <button
                  type="button"
                  className="chrono-back-btn"
                  onClick={() => dispatch({ type: 'SHOW_MAP' })}
                >
                  ← map
                </button>
                <span className="chrono-detail-year display">{selectedYear}</span>
              </div>

              <SearchBar mode="graph" currentYear={selectedYear} onSearch={handleSearch} />

              <div className="chrono-detail-header-right">
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
              events={filteredEvents}
              year={selectedYear}
              onEventSelect={event => dispatch({ type: 'SELECT_EVENT', event })}
            />
          </div>
        </>
      )}

      {/* Event detail panel */}
      <EventPanel
        event={selectedEvent}
        onClose={() => dispatch({ type: 'SELECT_EVENT', event: null })}
      />

      {/* Loading screen — only for the yearMap → yearDetail transition;
          navigating around the map itself never shows it */}
      {loading && pendingYear !== null && (
        <output
          className="chrono-loading"
          aria-label={`Loading data for ${pendingYear ?? 'that year'}`}
        >
          <Backdrop />
          <SpiralMark variant="loader" className="chrono-loading-mark" />
          <div className="chrono-loading-name display">chronograph</div>
          <div className="chrono-loading-sub">
            Travelling to {pendingYear ?? 'the year'}<span className="chrono-dots" aria-hidden="true" />
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
    </>
  );
}
