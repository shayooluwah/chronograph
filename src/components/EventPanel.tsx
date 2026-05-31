import type { HistoricalEvent, EventCategory } from '../types';

// ── Category colours (mirrors Graph.tsx) ─────────────────────────────────────

const CATEGORY_COLORS: Record<EventCategory, string> = {
  birth:        '#4fc3f7',
  death:        '#ef9a9a',
  event:        '#fff176',
  organization: '#a5d6a7',
  publication:  '#ce93d8',
  war:          '#ff8a65',
  discovery:    '#80deea',
  other:        '#b0bec5',
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  birth:        'Birth',
  death:        'Death',
  event:        'Event',
  organization: 'Organization',
  publication:  'Publication',
  war:          'War',
  discovery:    'Discovery',
  other:        'Other',
};

// ── Icon primitives ───────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="2" x2="2"  y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="13" height="16" viewBox="0 0 13 16"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: '2px' }}
    >
      <path
        d="M6.5 0C4.015 0 2 2.015 2 4.5c0 3.375 4.5 8.5 4.5 8.5S11 7.875 11 4.5C11 2.015 8.985 0 6.5 0Z"
        fill="currentColor" opacity="0.7"
      />
      <circle cx="6.5" cy="4.5" r="1.5" fill="white" opacity="0.9" />
      <line x1="6.5" y1="13" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="13" height="13" viewBox="0 0 13 13"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
      <path
        d="M8 1h4v4M12 1 6.5 6.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EventPanelProps {
  event:   HistoricalEvent | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventPanel({ event, onClose }: EventPanelProps) {
  const isOpen  = event !== null;
  const color   = event ? CATEGORY_COLORS[event.category]  : '#b0bec5';
  const catLabel = event ? CATEGORY_LABELS[event.category] : '';

  // Close on backdrop click (mobile bottom-sheet feel)
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape key
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <>
      {/* ── Backdrop (mobile only, fades with panel) ── */}
      <div
        onClick={handleBackdropClick}
        aria-hidden="true"
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          40,
          background:      'rgba(0,0,0,0.45)',
          opacity:         isOpen ? 1 : 0,
          pointerEvents:   isOpen ? 'auto' : 'none',
          transition:      'opacity 300ms ease',
          // Only visible on mobile (< 768px); on desktop the panel is opaque enough
          display:         'none',
        }}
        className="sm-backdrop"
      />

      {/* ── Panel ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event?.title ?? 'Event detail'}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        style={{
          // Positioning
          position:   'fixed',
          zIndex:     50,
          top:        0,
          right:      0,
          height:     '100%',
          width:      '380px',

          // Glassmorphism
          background:    'rgba(10, 10, 30, 0.92)',
          backdropFilter:'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderLeft:    '1px solid rgba(255,255,255,0.10)',

          // Slide animation — desktop default (translateX)
          transform:  isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease',

          // Inner scroll
          overflowY:  'auto',
          display:    'flex',
          flexDirection: 'column',
        }}
        // Inline responsive override injected via a <style> tag below
      >
        {/* ── Inner content ── */}
        <div style={{ padding: '28px 24px 32px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              aria-label="Close panel"
              style={{
                background:  'rgba(255,255,255,0.06)',
                border:      '1px solid rgba(255,255,255,0.12)',
                borderRadius:'8px',
                color:       'rgba(255,255,255,0.7)',
                cursor:      'pointer',
                padding:     '7px',
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                transition:  'background 150ms, color 150ms',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {event && (
            <>
              {/* Category badge */}
              <div>
                <span
                  style={{
                    display:      'inline-block',
                    padding:      '3px 12px',
                    borderRadius: '999px',
                    fontSize:     '11px',
                    fontWeight:   600,
                    letterSpacing:'0.06em',
                    textTransform:'uppercase',
                    color:        color,
                    background:   `${color}22`,   // ~13% opacity tint
                    border:       `1px solid ${color}55`, // ~33% opacity border
                  }}
                >
                  {catLabel}
                </span>
              </div>

              {/* Title */}
              <h2
                style={{
                  margin:     0,
                  fontSize:   '22px',
                  fontWeight: 700,
                  color:      '#ffffff',
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                }}
              >
                {event.title}
              </h2>

              {/* Year / Date */}
              <div
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '6px',
                  fontSize:   '13px',
                  color:      'rgba(200,210,255,0.55)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span
                  style={{
                    background:   'rgba(255,255,255,0.06)',
                    border:       '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding:      '2px 8px',
                    fontWeight:   600,
                    color:        'rgba(200,215,255,0.75)',
                  }}
                >
                  {event.date ? event.date : event.year}
                </span>
              </div>

              {/* Location */}
              {event.location && (
                <div
                  style={{
                    display:    'flex',
                    alignItems: 'flex-start',
                    gap:        '7px',
                    fontSize:   '13px',
                    color:      'rgba(200,210,255,0.5)',
                  }}
                >
                  <PinIcon />
                  <span style={{ lineHeight: 1.5 }}>{event.location}</span>
                </div>
              )}

              {/* Divider */}
              <div
                style={{
                  height:     '1px',
                  background: 'rgba(255,255,255,0.07)',
                  margin:     '0 -4px',
                }}
              />

              {/* Description */}
              <p
                style={{
                  margin:     0,
                  fontSize:   '14px',
                  lineHeight: 1.75,
                  color:      'rgba(210,220,255,0.65)',
                  flex:       1,
                }}
              >
                {event.description || 'No description available.'}
              </p>
            </>
          )}
        </div>

        {/* ── Wikipedia button — pinned to bottom ── */}
        {event?.wikipediaUrl && (
          <div
            style={{
              padding:      '0 24px 28px',
              borderTop:    '1px solid rgba(255,255,255,0.07)',
              paddingTop:   '20px',
            }}
          >
            <a
              href={event.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            '8px',
                width:          '100%',
                padding:        '11px 16px',
                borderRadius:   '10px',
                border:         '1px solid rgba(255,255,255,0.15)',
                background:     'rgba(255,255,255,0.06)',
                color:          'rgba(210,225,255,0.85)',
                fontSize:       '13px',
                fontWeight:     500,
                textDecoration: 'none',
                cursor:         'pointer',
                transition:     'background 150ms, border-color 150ms, color 150ms',
                boxSizing:      'border-box',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background   = 'rgba(255,255,255,0.11)';
                el.style.borderColor  = 'rgba(255,255,255,0.28)';
                el.style.color        = '#ffffff';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background   = 'rgba(255,255,255,0.06)';
                el.style.borderColor  = 'rgba(255,255,255,0.15)';
                el.style.color        = 'rgba(210,225,255,0.85)';
              }}
            >
              Read more on Wikipedia
              <ExternalLinkIcon />
            </a>
          </div>
        )}
      </div>

      {/* ── Responsive overrides via scoped <style> ── */}
      <style>{`
        @media (max-width: 767px) {
          /* Turn the panel into a bottom sheet */
          [role="dialog"][aria-label] {
            top:        auto !important;
            bottom:     0    !important;
            left:       0    !important;
            right:      0    !important;
            width:      100% !important;
            height:     75svh !important;
            max-height: 75svh !important;
            border-left:   none       !important;
            border-top:    1px solid rgba(255,255,255,0.10) !important;
            border-radius: 20px 20px 0 0 !important;
            transform: ${isOpen ? 'translateY(0)' : 'translateY(100%)'} !important;
          }

          /* Show the backdrop on mobile */
          .sm-backdrop {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}
