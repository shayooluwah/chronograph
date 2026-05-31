import { useReducer } from 'react';
import SpaceBackground from './components/SpaceBackground';
import SearchBar       from './components/SearchBar';
import Graph           from './components/Graph';
import EventPanel      from './components/EventPanel';
import CategoryFilter  from './components/CategoryFilter';
import { ALL_CATEGORIES } from './constants/categories';
import { fetchYearEvents } from './api/yearApi';
import type { HistoricalEvent, EventCategory } from './types';
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

interface AppState {
  selectedYear:     number | null;
  pendingYear:      number | null;
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
  | { type: 'SELECT_EVENT';   event: HistoricalEvent | null }
  | { type: 'SET_CATEGORIES'; categories: Set<EventCategory> };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SEARCH_START':
      return { ...state, pendingYear: action.year, loading: true, error: null, selectedEvent: null };
    case 'SEARCH_SUCCESS':
      return { ...state, pendingYear: null, loading: false, selectedYear: action.year, events: action.events };
    case 'SEARCH_ERROR':
      return { ...state, pendingYear: null, loading: false, error: 'Could not load data for this year. Try another.' };
    case 'SELECT_EVENT':
      return { ...state, selectedEvent: action.event };
    case 'SET_CATEGORIES':
      return { ...state, activeCategories: action.categories };
  }
}

const initialState: AppState = {
  selectedYear:     null,
  pendingYear:      null,
  events:           [],
  loading:          false,
  error:            null,
  selectedEvent:    null,
  activeCategories: new Set(ALL_CATEGORIES),
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { selectedYear, pendingYear, events, loading, error, selectedEvent, activeCategories } = state;

  const isGraph        = selectedYear !== null;
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

      {/* Search bar — morphs landing ↔ graph */}
      <SearchBar
        mode={isGraph ? 'graph' : 'landing'}
        currentYear={selectedYear ?? undefined}
        onSearch={handleSearch}
      />

      {/* Category filter pills (graph mode only) */}
      {isGraph && (
        <CategoryFilter
          active={activeCategories}
          onChange={categories => dispatch({ type: 'SET_CATEGORIES', categories })}
        />
      )}

      {/* Graph canvas — stays mounted during re-fetch so screen never goes blank */}
      {isGraph && (
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

      {/* Loading overlay */}
      {loading && (
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
          style={{ top: isGraph ? '110px' : 'calc(50% + 118px)' }}
        >
          {error}
        </div>
      )}
    </>
  );
}
