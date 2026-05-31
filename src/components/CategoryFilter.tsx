import type { EventCategory } from '../types';

// ── Category definitions ──────────────────────────────────────────────────────

/**
 * Single source of truth for every category displayed in the filter row.
 * Mirrors the colour palette used in Graph.tsx.
 * Exported so App.tsx can initialise `activeCategories` without duplicating
 * the list.
 */
export const FILTER_CATEGORIES: {
  id:    EventCategory;
  label: string;
  color: string;
}[] = [
  { id: 'birth',        label: 'Births',        color: '#4fc3f7' },
  { id: 'death',        label: 'Deaths',        color: '#ef9a9a' },
  { id: 'event',        label: 'Events',        color: '#fff176' },
  { id: 'organization', label: 'Organizations', color: '#a5d6a7' },
  { id: 'publication',  label: 'Publications',  color: '#ce93d8' },
  { id: 'war',          label: 'Wars',          color: '#ff8a65' },
  { id: 'discovery',    label: 'Discoveries',   color: '#80deea' },
  { id: 'other',        label: 'Other',         color: '#b0bec5' },
];

/** Convenience set containing every category id — use as default active state. */
export const ALL_CATEGORIES = new Set<EventCategory>(
  FILTER_CATEGORIES.map(c => c.id),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a 6-digit hex string to `rgba(r,g,b,a)`.
 * Used inline so we avoid importing a shared helper.
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CategoryFilterProps {
  /** Set of currently visible category ids. Controlled by the parent. */
  active:   Set<EventCategory>;
  /** Called whenever the user toggles a pill. Receives the updated Set. */
  onChange: (next: Set<EventCategory>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryFilter({ active, onChange }: CategoryFilterProps) {

  function toggle(id: EventCategory) {
    const next = new Set(active);
    if (next.has(id)) {
      // Guard: always keep at least one category visible
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set<EventCategory>(FILTER_CATEGORIES.map(c => c.id)));
  }

  const allActive = active.size === FILTER_CATEGORIES.length;

  return (
    <>
      {/* Scrollbar suppression for the pill row */}
      <style>{`
        .chrono-filter-bar::-webkit-scrollbar { display: none; }
      `}</style>

      <div
        className="chrono-filter-bar"
        role="group"
        aria-label="Filter events by category"
        style={{
          position:        'fixed',
          /* Sits immediately below the compact SearchBar.
             SearchBar compact height = 10px padding-top + ~38px input + 10px padding-bottom = 58px.
             Add 1px for the border-bottom. */
          top:             '59px',
          left:            0,
          right:           0,
          zIndex:          90,
          display:         'flex',
          alignItems:      'center',
          gap:             '6px',
          padding:         '7px 24px',
          overflowX:       'auto',
          scrollbarWidth:  'none',   // Firefox
          msOverflowStyle: 'none' as React.CSSProperties['msOverflowStyle'],
          background:      'rgba(6, 6, 20, 0.82)',
          backdropFilter:  'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:    '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* "All" shortcut pill — resets to every category active */}
        <button
          onClick={selectAll}
          aria-pressed={allActive}
          aria-label="Show all categories"
          style={{
            flexShrink:   0,
            padding:      '4px 12px',
            borderRadius: '999px',
            border:       `1px solid ${allActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.14)'}`,
            background:   allActive ? 'rgba(255,255,255,0.12)' : 'transparent',
            color:        allActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
            fontSize:     '11px',
            fontWeight:   allActive ? 600 : 400,
            fontFamily:   'system-ui, sans-serif',
            cursor:       'pointer',
            letterSpacing:'0.03em',
            transition:   'background 150ms ease, border-color 150ms ease, color 150ms ease',
            whiteSpace:   'nowrap',
          }}
          onMouseEnter={e => {
            if (!allActive) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)';
              e.currentTarget.style.color       = 'rgba(255,255,255,0.6)';
            }
          }}
          onMouseLeave={e => {
            if (!allActive) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
              e.currentTarget.style.color       = 'rgba(255,255,255,0.35)';
            }
          }}
        >
          All
        </button>

        {/* Thin vertical separator */}
        <div style={{
          flexShrink: 0,
          width:      '1px',
          height:     '18px',
          background: 'rgba(255,255,255,0.1)',
          margin:     '0 2px',
        }} />

        {/* Category pills */}
        {FILTER_CATEGORIES.map(({ id, label, color }) => {
          const on = active.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              aria-pressed={on}
              aria-label={`${on ? 'Hide' : 'Show'} ${label}`}
              style={{
                flexShrink:   0,
                display:      'flex',
                alignItems:   'center',
                gap:          '5px',
                padding:      '4px 12px',
                borderRadius: '999px',
                border:       `1px solid ${on ? color : 'rgba(255,255,255,0.13)'}`,
                background:   on ? hexToRgba(color, 0.18) : 'transparent',
                color:        on ? color : 'rgba(255,255,255,0.35)',
                fontSize:     '11px',
                fontWeight:   on ? 600 : 400,
                fontFamily:   'system-ui, sans-serif',
                cursor:       'pointer',
                letterSpacing:'0.03em',
                transition:   'background 150ms ease, border-color 150ms ease, color 150ms ease, font-weight 0ms',
                whiteSpace:   'nowrap',
              }}
              onMouseEnter={e => {
                if (!on) {
                  e.currentTarget.style.borderColor = hexToRgba(color, 0.45);
                  e.currentTarget.style.color       = hexToRgba(color, 0.7);
                  e.currentTarget.style.background  = hexToRgba(color, 0.07);
                }
              }}
              onMouseLeave={e => {
                if (!on) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)';
                  e.currentTarget.style.color       = 'rgba(255,255,255,0.35)';
                  e.currentTarget.style.background  = 'transparent';
                }
              }}
            >
              {/* Colour dot */}
              <span
                aria-hidden="true"
                style={{
                  width:        '6px',
                  height:       '6px',
                  borderRadius: '50%',
                  background:   on ? color : 'rgba(255,255,255,0.2)',
                  flexShrink:   0,
                  transition:   'background 150ms ease',
                  boxShadow:    on ? `0 0 5px ${hexToRgba(color, 0.6)}` : 'none',
                }}
              />
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
