import { useReducer } from 'react';
import SpaceBackground from './components/SpaceBackground';
import SearchBar       from './components/SearchBar';
import YearMap         from './components/YearMap';
import Graph           from './components/Graph';
import EventPanel      from './components/EventPanel';
import CategoryFilter  from './components/CategoryFilter';
import { ALL_CATEGORIES } from './constants/categories';
import { fetchYearEvents } from './api/yearApi';
import type { HistoricalEvent, EventCategory, YearMapLink } from './types';
import './App.css';

// ── Loading animation data ────────────────────────────────────────────────────

const PARTICLE_RADIUS = 195;

/** Deterministic particle data (no Math.random in render). */
const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle       = (2 * Math.PI * i) / 10 - Math.PI / 2;
  const radiusScale = 0.78 + ((i * 6271) % 44) / 100;
  const r           = PARTICLE_RADIUS * radiusScale;
  return {
    dx:       Math.round(Math.cos(angle) * r),
    dy:       Math.round(Math.sin(angle) * r),
    delay:    +((i * 0.17).toFixed(2)),
    duration: +(1.55 + (i % 3) * 0.2).toFixed(2),
    size:     `${2 + (i % 3)}px`,
    color:    (['#c8d8ff', '#ffffff', '#d8c8ff'] as const)[i % 3],
  };
});

const PULSE_RINGS = [
  { delay: 0.0, diameter: '80px', color: 'rgba(150,180,255,0.40)' },
  { delay: 0.7, diameter: '54px', color: 'rgba(210,190,255,0.32)' },
  { delay: 1.4, diameter: '36px', color: 'rgba(255,255,255,0.25)'  },
];

// ── CSS keyframes ─────────────────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes chrono-pulse-ring {
    0%   { transform: scale(0.45); opacity: 1; }
    100% { transform: scale(3.2);  opacity: 0; }
  }
  @keyframes chrono-particle {
    0%   { transform: translate(var(--dx), var(--dy)) scale(1.6); opacity: 0;    }
    10%  { opacity: 1; }
    82%  { opacity: 0.65; }
    100% { transform: translate(0px, 0px) scale(0);              opacity: 0;    }
  }
  @keyframes chrono-text-breathe {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 1;    }
  }
  @keyframes chrono-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
  }
`;

// ── State / reducer ───────────────────────────────────────────────────────────

/** Years shown on the navigation map before the user has searched anything. */
const SEED_YEARS = [1776, 1789, 1848, 1914, 1945, 1969, 1989, 2001];

/** Seed nodes start connected in chronological sequence. */
const SEED_LINKS: YearMapLink[] = SEED_YEARS.slice(1).map((year, i) => ({
  source: SEED_YEARS[i],
  target: year,
}));

/** Hard cap on map nodes to keep the force simulation cheap. */
const MAX_MAP_NODES = 30;

/** The existing map year chronologically closest to `year`. */
function nearestYear(years: number[], year: number): number {
  return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best));
}

/**
 * Years referenced by the visited year's events (from the /api/year payload
 * already in state): lifespans, founding dates etc. mentioned in titles and
 * descriptions. Most-mentioned first, ties broken by proximity to the visit.
 */
function extractRelatedYears(events: HistoricalEvent[], visitedYear: number): number[] {
  const counts = new Map<number, number>();
  for (const ev of events) {
    for (const match of `${ev.title} ${ev.description}`.matchAll(/\b\d{3,4}\b/g)) {
      const y = parseInt(match[0], 10);
      if (y === visitedYear) continue;
      if (y < 100 || y > 2100) continue;                // not a plausible year mention
      if (Math.abs(y - visitedYear) > 200) continue;    // keep the map neighbourhood local
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries());
  ranked.sort((a, b) => b[1] - a[1] || Math.abs(a[0] - visitedYear) - Math.abs(b[0] - visitedYear));
  return ranked.map(([y]) => y);
}

/** Grow the map around a just-visited year: up to 3 related (or nearby) years,
 *  each linked back to the visited node, respecting the node cap. */
function expandAroundYear(
  years:       number[],
  links:       YearMapLink[],
  visitedYear: number,
  events:      HistoricalEvent[],
): { mapYears: number[]; mapLinks: YearMapLink[] } {
  let related = extractRelatedYears(events, visitedYear).filter(y => !years.includes(y));
  if (related.length === 0) {
    related = [visitedYear - 10, visitedYear + 10, visitedYear + 25]
      .filter(y => y !== 0 && !years.includes(y)); // year 0 does not exist
  }
  related = related.slice(0, Math.min(3, Math.max(0, MAX_MAP_NODES - years.length)));
  if (related.length === 0) return { mapYears: years, mapLinks: links };
  return {
    mapYears: [...years, ...related],
    mapLinks: [...links, ...related.map(y => ({ source: visitedYear, target: y }))],
  };
}

type AppView = 'yearMap' | 'yearDetail';

interface AppState {
  view:             AppView;
  selectedYear:     number | null;
  pendingYear:      number | null;
  mapYears:         number[];
  mapLinks:         YearMapLink[];
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
      const isNewYear = !state.mapYears.includes(action.year);
      return {
        ...state,
        view:         'yearDetail',
        pendingYear:  null,
        loading:      false,
        selectedYear: action.year,
        events:       action.events,
        // Every successfully opened year becomes a node on the map,
        // linked to its chronologically nearest existing node …
        mapYears: isNewYear ? [...state.mapYears, action.year] : state.mapYears,
        mapLinks: isNewYear && state.mapYears.length > 0
          ? [...state.mapLinks, { source: nearestYear(state.mapYears, action.year), target: action.year }]
          : state.mapLinks,
        // … and is remembered as visited (highlighted on the map)
        visitedYears: state.visitedYears.has(action.year)
          ? state.visitedYears
          : new Set(state.visitedYears).add(action.year),
      };
    }
    case 'SEARCH_ERROR':
      return { ...state, pendingYear: null, loading: false, error: 'Could not load data for this year. Try another.' };
    case 'SHOW_MAP': {
      // Returning to the map grows it: related years sprout from the visited node
      const expanded = state.selectedYear !== null
        ? expandAroundYear(state.mapYears, state.mapLinks, state.selectedYear, state.events)
        : { mapYears: state.mapYears, mapLinks: state.mapLinks };
      return {
        ...state,
        ...expanded,
        view:          'yearMap',
        selectedYear:  null,
        selectedEvent: null,
        error:         null,
      };
    }
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
  mapYears:         SEED_YEARS,
  mapLinks:         SEED_LINKS,
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
  const {
    view, selectedYear, pendingYear, mapYears, mapLinks, visitedYears,
    events, loading, error, selectedEvent, activeCategories,
  } = state;

  const isDetail       = view === 'yearDetail' && selectedYear !== null;
  const filteredEvents = events.filter(e => activeCategories.has(e.category));

  async function handleSearch(year: number) {
    if (loading) return;
    dispatch({ type: 'SEARCH_START', year });
    try {
      const data = await fetchYearEvents(year);
      dispatch({ type: 'SEARCH_SUCCESS', year, events: data });
    } catch {
      dispatch({ type: 'SEARCH_ERROR' });
    }
  }

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Persistent starfield */}
      <SpaceBackground />

      {/* yearMap view — entry / navigation layer */}
      {!isDetail && (
        <>
          <h1 className="chrono-brand">ChronoGraph</h1>
          <YearMap
            years={mapYears}
            links={mapLinks}
            visitedYears={visitedYears}
            onYearSelect={handleSearch}
          />
        </>
      )}

      {/* Back to the year map from the yearDetail view */}
      {isDetail && (
        <button
          type="button"
          className="chrono-back-btn"
          onClick={() => dispatch({ type: 'SHOW_MAP' })}
        >
          ← Map
        </button>
      )}

      {/* Search bar — morphs map (top-right) ↔ detail (top bar) */}
      <SearchBar
        mode={isDetail ? 'graph' : 'map'}
        currentYear={selectedYear ?? undefined}
        onSearch={handleSearch}
      />

      {/* Category filter pills (yearDetail only) */}
      {isDetail && (
        <CategoryFilter
          active={activeCategories}
          onChange={categories => dispatch({ type: 'SET_CATEGORIES', categories })}
        />
      )}

      {/* yearDetail view — radial event graph for the selected year */}
      {isDetail && selectedYear !== null && (
        <div className="graph-container">
          <Graph
            events={filteredEvents}
            year={selectedYear}
            onEventSelect={event => dispatch({ type: 'SELECT_EVENT', event })}
          />
        </div>
      )}

      {/* Event detail panel */}
      <EventPanel
        event={selectedEvent}
        onClose={() => dispatch({ type: 'SELECT_EVENT', event: null })}
      />

      {/* Loading overlay — only for the yearMap → yearDetail transition;
          navigating around the map itself never shows it */}
      {loading && pendingYear !== null && (
        <output
          className="chrono-loading"
          aria-label={`Loading data for ${pendingYear ?? 'that year'}`}
        >
          {/* Burst origin */}
          <div className="chrono-burst">

            {PULSE_RINGS.map((ring, i) => (
              <div
                key={i}
                className="chrono-pulse-ring"
                style={{
                  '--diameter':   ring.diameter,
                  '--ring-color': ring.color,
                  animation: `chrono-pulse-ring 2.4s ${ring.delay}s ease-out infinite`,
                } as React.CSSProperties}
              />
            ))}

            <div className="chrono-orb" aria-hidden="true" />

            {PARTICLES.map((p, i) => (
              <div
                key={i}
                className="chrono-particle"
                aria-hidden="true"
                style={{
                  '--size':  p.size,
                  '--color': p.color,
                  '--dx':    `${p.dx}px`,
                  '--dy':    `${p.dy}px`,
                  animation: `chrono-particle ${p.duration}s ${p.delay}s ease-in infinite`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <p className="chrono-status-text">
            Travelling to {pendingYear ?? '…'}
          </p>
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
