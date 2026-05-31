import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchBarProps {
  /** Controls which visual layout is active. */
  mode:        'landing' | 'graph';
  /** When in graph mode, seeds the input with the active year. */
  currentYear?: number;
  /** Called with a validated integer year on submit. */
  onSearch:    (year: number) => void;
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M3 7.5h9M8.5 3.5l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Easing ────────────────────────────────────────────────────────────────────

/** Material-style ease — fast start, soft landing. Used for the morph. */
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const MORPH_MS = 380;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchBar({ mode, currentYear, onSearch }: SearchBarProps) {
  const [raw,   setRaw]   = useState(currentYear !== undefined ? String(currentYear) : '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isGraph  = mode === 'graph';

  // Keep input in sync when the parent changes the active year
  useEffect(() => {
    if (currentYear !== undefined) setRaw(String(currentYear));
  }, [currentYear]);

  // ── Validation ──────────────────────────────────────────────────────────────

  /** Returns a valid non-zero integer or null. */
  function parse(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    // Reject floats, leading zeros (except bare 0), non-numeric junk
    if (isNaN(n) || String(n) !== trimmed) return null;
    // Reject year 0 (proleptic Gregorian doesn't use it)
    if (n === 0) return null;
    return n;
  }

  function handleSubmit() {
    const year = parse(raw);
    if (year === null) {
      const t = raw.trim();
      setError(
        !t             ? 'Please enter a year.'
        : t === '0'    ? 'Year 0 does not exist — use −1 for 1 BCE.'
        : 'Enter a whole number, e.g. 1754 or −44.',
      );
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSearch(year);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit();
  }

  /** Restrict typing to an optional leading minus followed by digits. */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (/^-?\d*$/.test(v)) {
      setRaw(v);
      if (error) setError(null);
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const morphTransition = [
    `top ${MORPH_MS}ms ${EASE}`,
    `left ${MORPH_MS}ms ${EASE}`,
    `width ${MORPH_MS}ms ${EASE}`,
    `transform ${MORPH_MS}ms ${EASE}`,
    `padding ${MORPH_MS}ms ${EASE}`,
    `background 300ms ease`,
    `border-color 300ms ease`,
    `border-radius 300ms ease`,
  ].join(', ');

  const containerStyle: React.CSSProperties = {
    position:           'fixed',
    zIndex:             100,

    // Morphing layout: centred → top bar
    top:                isGraph ? 0 : '50%',
    left:               isGraph ? 0 : '50%',
    width:              isGraph ? '100%' : 'min(540px, calc(100vw - 40px))',
    transform:          isGraph ? 'none' : 'translate(-50%, -50%)',

    // Morphing appearance
    background:         isGraph ? 'rgba(8, 8, 24, 0.92)' : 'transparent',
    backdropFilter:     isGraph ? 'blur(20px)' : 'none',
    WebkitBackdropFilter: isGraph ? 'blur(20px)' : 'none',
    borderBottom:       isGraph ? '1px solid rgba(255,255,255,0.08)' : 'none',
    padding:            isGraph ? '10px 24px' : '0',
    boxSizing:          'border-box',

    transition: morphTransition,
  };

  // Compact sizing in graph mode, comfortable sizing in landing mode
  const inputFontSize  = isGraph ? '15px' : '18px';
  const inputPadding   = isGraph ? '9px 14px' : '14px 20px';
  const inputRadius    = isGraph ? '8px' : '12px';
  const buttonPadding  = isGraph ? '9px 18px' : '14px 28px';
  const buttonFontSize = isGraph ? '14px' : '16px';
  const buttonRadius   = isGraph ? '8px' : '12px';

  const sharedTransition =
    `font-size ${MORPH_MS}ms ${EASE}, padding ${MORPH_MS}ms ${EASE}, border-radius ${MORPH_MS}ms ${EASE}`;

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>

      {/* ── Hero text — fades and collapses when entering graph mode ── */}
      <div
        aria-hidden={isGraph}
        style={{
          overflow:     'hidden',
          maxHeight:    isGraph ? '0px' : '200px',
          opacity:      isGraph ? 0 : 1,
          marginBottom: isGraph ? '0px' : '36px',
          pointerEvents:isGraph ? 'none' : 'auto',
          transition:   `max-height ${MORPH_MS}ms ${EASE}, opacity 240ms ease, margin-bottom ${MORPH_MS}ms ${EASE}`,
        }}
      >
        <h1
          style={{
            margin:      '0 0 14px',
            fontSize:    'clamp(36px, 7vw, 58px)',
            fontWeight:  300,
            color:       '#ffffff',
            letterSpacing: '-1.5px',
            fontFamily:  'system-ui, sans-serif',
            lineHeight:  1.1,
            textShadow:  '0 0 60px rgba(160, 190, 255, 0.35)',
          }}
        >
          ChronoGraph
        </h1>
        <p
          style={{
            margin:      0,
            fontSize:    '16px',
            color:       'rgba(195, 210, 255, 0.6)',
            lineHeight:  1.65,
            fontFamily:  'system-ui, sans-serif',
          }}
        >
          Explore what was happening everywhere in history, one year at a time.
        </p>
      </div>

      {/* ── Input row ── */}
      <div style={{ display: 'flex', gap: isGraph ? '8px' : '12px', alignItems: 'stretch' }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={raw}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter a year, e.g. 1754"
          aria-label="Year to explore"
          aria-describedby={error ? 'search-error' : undefined}
          style={{
            flex:        1,
            background:  'rgba(255,255,255,0.05)',
            border:      `1px solid ${error ? 'rgba(239,154,154,0.55)' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: inputRadius,
            color:       '#ffffff',
            fontFamily:  'system-ui, sans-serif',
            fontSize:    inputFontSize,
            padding:     inputPadding,
            outline:     'none',
            transition:  `border-color 150ms ease, ${sharedTransition}`,
            minWidth:    0,
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.60)'; }}
          onBlur={e   => {
            e.currentTarget.style.borderColor = error
              ? 'rgba(239,154,154,0.55)'
              : 'rgba(255,255,255,0.20)';
          }}
        />

        <button
          onClick={handleSubmit}
          aria-label="Search this year"
          style={{
            flexShrink:  0,
            display:     'flex',
            alignItems:  'center',
            gap:         '6px',
            background:  'rgba(255,255,255,0.09)',
            border:      '1px solid rgba(255,255,255,0.22)',
            borderRadius: buttonRadius,
            color:       '#ffffff',
            cursor:      'pointer',
            fontFamily:  'system-ui, sans-serif',
            fontSize:    buttonFontSize,
            fontWeight:  500,
            padding:     buttonPadding,
            whiteSpace:  'nowrap',
            transition:  `background 150ms ease, border-color 150ms ease, ${sharedTransition}`,
          }}
          onMouseEnter={e => {
            const b = e.currentTarget;
            b.style.background   = 'rgba(255,255,255,0.17)';
            b.style.borderColor  = 'rgba(255,255,255,0.42)';
          }}
          onMouseLeave={e => {
            const b = e.currentTarget;
            b.style.background   = 'rgba(255,255,255,0.09)';
            b.style.borderColor  = 'rgba(255,255,255,0.22)';
          }}
        >
          {isGraph ? <ArrowRightIcon /> : 'Explore'}
        </button>
      </div>

      {/* ── Inline error message ── */}
      <div
        id="search-error"
        role={error ? 'alert' : undefined}
        style={{
          overflow:    'hidden',
          maxHeight:   error ? '36px' : '0px',
          opacity:     error ? 1 : 0,
          marginTop:   error ? '8px' : '0px',
          transition:  'max-height 200ms ease, opacity 180ms ease, margin-top 200ms ease',
          pointerEvents: 'none',
        }}
      >
        <p style={{
          margin:     0,
          fontSize:   '12px',
          color:      '#ef9a9a',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.4,
        }}>
          {error}
        </p>
      </div>

    </div>
  );
}
