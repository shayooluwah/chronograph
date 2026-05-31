import { useState } from 'react';
import SpaceBackground   from './components/SpaceBackground';
import SearchBar         from './components/SearchBar';
import Graph             from './components/Graph';
import EventPanel        from './components/EventPanel';
import CategoryFilter, { ALL_CATEGORIES } from './components/CategoryFilter';
import { fetchYearEvents } from './api/yearApi';
import type { HistoricalEvent, EventCategory } from './types';
import './App.css';

// ── Loading animation constants ───────────────────────────────────────────────

/**
 * Particle positions are computed once at module load so that
 * Math.random is never called inside render — no useMemo needed.
 * The pseudo-scatter uses integer arithmetic for determinism.
 */
const PARTICLE_RADIUS = 195;

const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle        = (2 * Math.PI * i) / 10 - Math.PI / 2; // 12-o-clock start
  const radiusScale  = 0.78 + ((i * 6271) % 44) / 100;       // 0.78 – 1.22
  const r            = PARTICLE_RADIUS * radiusScale;

  return {
    dx:       Math.round(Math.cos(angle) * r),
    dy:       Math.round(Math.sin(angle) * r),
    delay:    +((i * 0.17).toFixed(2)),                        // 0.00 … 1.53 s
    duration: +(1.55 + (i % 3) * 0.2).toFixed(2),             // 1.55 | 1.75 | 1.95 s
    size:     2 + (i % 3),                                     // 2 | 3 | 4 px
    color:    (['#c8d8ff', '#ffffff', '#d8c8ff'] as const)[i % 3],
  };
});

/** Concentric pulse rings — each ring animates independently. */
const PULSE_RINGS = [
  { delay: 0.0, diameter: 80, color: 'rgba(150,180,255,0.40)' },
  { delay: 0.7, diameter: 54, color: 'rgba(210,190,255,0.32)' },
  { delay: 1.4, diameter: 36, color: 'rgba(255,255,255,0.25)' },
];

// ── CSS keyframes (injected once via a static <style> block) ─────────────────

const KEYFRAMES = `
  @keyframes chrono-pulse-ring {
    0%   { transform: scale(0.45); opacity: 1;   }
    100% { transform: scale(3.2);  opacity: 0;   }
  }

  /* Particle travels FROM its (--dx, --dy) offset toward the orb at origin */
  @keyframes chrono-particle {
    0%   { transform: translate(var(--dx), var(--dy)) scale(1.6); opacity: 0;   }
    10%  { opacity: 1; }
    82%  { opacity: 0.65; }
    100% { transform: translate(0px, 0px) scale(0);             opacity: 0;   }
  }

  @keyframes chrono-text-breathe {
    0%, 100% { opacity: 0.55; }
    50%       { opacity: 1;   }
  }

  /* Error / success banner entrance */
  @keyframes chrono-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── State ───────────────────────────────────────────────────────────────────

  /** The year that has successfully loaded and is displayed in the graph. */
  const [selectedYear,      setSelectedYear]      = useState<number | null>(null);
  /** The year currently being fetched (drives the "Travelling to…" text). */
  const [pendingYear,       setPendingYear]        = useState<number | null>(null);

  const [events,            setEvents]            = useState<HistoricalEvent[]>([]);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  const [selectedEvent,     setSelectedEvent]     = useState<HistoricalEvent | null>(null);
  const [activeCategories,  setActiveCategories]  = useState<Set<EventCategory>>(
    new Set(ALL_CATEGORIES),
  );

  // ── Derived ─────────────────────────────────────────────────────────────────

  /**
   * Once a year has loaded successfully, we stay in graph mode even while
   * a subsequent search is in flight — the old graph remains visible beneath
   * the loading overlay so the screen never goes blank.
   */
  const isGraph = selectedYear !== null;

  const filteredEvents = events.filter(e => activeCategories.has(e.category));

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSearch(year: number) {
    if (loading) return; // debounce rapid submits

    setPendingYear(year);
    setLoading(true);
    setError(null);
    setSelectedEvent(null);

    try {
      const data = await fetchYearEvents(year);
      setEvents(data);
      setSelectedYear(year);
    } catch {
      setError('Could not load data for this year. Try another.');
      // selectedYear intentionally NOT cleared — keep the previous graph visible
    } finally {
      setLoading(false);
      setPendingYear(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Animation keyframes ── */}
      <style>{KEYFRAMES}</style>

      {/* ── Persistent starfield — never unmounts ── */}
      <SpaceBackground />

      {/* ── Search bar — morphs landing ↔ graph ── */}
      <SearchBar
        mode={isGraph ? 'graph' : 'landing'}
        currentYear={selectedYear ?? undefined}
        onSearch={handleSearch}
      />

      {/* ── Category filter pills (graph mode only) ── */}
      {isGraph && (
        <CategoryFilter
          active={activeCategories}
          onChange={setActiveCategories}
        />
      )}

      {/* ── Graph canvas (remains visible while re-loading) ── */}
      {isGraph && (
        <div
          style={{
            position: 'fixed',
            /**
             * Top offset = compact SearchBar (~58 px) + CategoryFilter (~41 px) + 1 px border.
             * Both bars are `position: fixed`; the graph fills everything below them.
             */
            top:    '100px',
            left:   0,
            right:  0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          <Graph
            events={filteredEvents}
            year={selectedYear}
            onEventSelect={setSelectedEvent}
          />
        </div>
      )}

      {/* ── Event detail panel ── */}
      <EventPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      {/* ── Loading overlay ── */}
      {loading && (
        <div
          role="status"
          aria-label={`Loading data for ${pendingYear ?? 'that year'}`}
          style={{
            position:        'fixed',
            inset:           0,
            zIndex:          80,
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            justifyContent:  'center',
            background:      'rgba(5, 5, 16, 0.60)',
            backdropFilter:  'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {/* Burst origin — every child is positioned relative to this 1×1 point */}
          <div style={{ position: 'relative', width: 0, height: 0 }}>

            {/* ── Expanding pulse rings ── */}
            {PULSE_RINGS.map((ring, i) => (
              <div
                key={i}
                style={{
                  position:     'absolute',
                  top:          '50%',
                  left:         '50%',
                  width:        `${ring.diameter}px`,
                  height:       `${ring.diameter}px`,
                  marginTop:    `-${ring.diameter / 2}px`,
                  marginLeft:   `-${ring.diameter / 2}px`,
                  borderRadius: '50%',
                  border:       `1.5px solid ${ring.color}`,
                  animation:    `chrono-pulse-ring 2.4s ${ring.delay}s ease-out infinite`,
                }}
              />
            ))}

            {/* ── Central glowing orb ── */}
            <div
              aria-hidden="true"
              style={{
                position:     'absolute',
                top:          '50%',
                left:         '50%',
                width:        '30px',
                height:       '30px',
                marginTop:    '-15px',
                marginLeft:   '-15px',
                borderRadius: '50%',
                background:   'radial-gradient(circle at 38% 38%, #ffffff 0%, #a0baff 45%, #5060ef 100%)',
                boxShadow:    '0 0 24px 8px rgba(120,150,255,0.55)',
              }}
            />

            {/* ── Inward-streaming particles ── */}
            {PARTICLES.map((p, i) => (
              <div
                key={i}
                aria-hidden="true"
                style={{
                  position:     'absolute',
                  top:          '50%',
                  left:         '50%',
                  width:        `${p.size}px`,
                  height:       `${p.size}px`,
                  marginTop:    `-${p.size / 2}px`,
                  marginLeft:   `-${p.size / 2}px`,
                  borderRadius: '50%',
                  background:   p.color,
                  boxShadow:    `0 0 ${p.size * 2}px ${p.size}px ${p.color}`,
                  opacity:      0,         // controlled entirely by keyframe
                  // CSS custom properties consumed by @keyframes chrono-particle
                  ...({ '--dx': `${p.dx}px`, '--dy': `${p.dy}px` } as React.CSSProperties),
                  animation:    `chrono-particle ${p.duration}s ${p.delay}s ease-in infinite`,
                }}
              />
            ))}

          </div>{/* /burst origin */}

          {/* ── Status text ── */}
          <p
            style={{
              marginTop:     '72px',
              color:         'rgba(195, 215, 255, 0.75)',
              fontSize:      '13px',
              fontFamily:    'system-ui, sans-serif',
              letterSpacing: '0.05em',
              userSelect:    'none',
              animation:     'chrono-text-breathe 2s ease-in-out infinite',
            }}
          >
            Travelling to {pendingYear ?? '…'}
          </p>
        </div>
      )}

      {/* ── API error banner ── */}
      {error && !loading && (
        <div
          role="alert"
          style={{
            position:     'fixed',
            zIndex:       95,
            left:         '50%',
            /**
             * In graph mode: sits just below the CategoryFilter row (~100px).
             * In landing mode: sits below the vertically-centred search block
             * (~50% + 120px covers the hero text + input row height).
             */
            top:          isGraph ? '110px' : 'calc(50% + 118px)',
            transform:    'translateX(-50%)',
            background:   'rgba(239, 154, 154, 0.10)',
            border:       '1px solid rgba(239, 154, 154, 0.30)',
            borderRadius: '8px',
            padding:      '9px 20px',
            color:        '#ef9a9a',
            fontSize:     '13px',
            fontFamily:   'system-ui, sans-serif',
            whiteSpace:   'nowrap',
            animation:    'chrono-slide-up 280ms ease forwards',
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
