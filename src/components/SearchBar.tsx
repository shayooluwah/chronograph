import { useState, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchBarProps {
  mode:     'landing' | 'graph' | 'map';
  onSearch: (year: number) => void;
}

// ── Pure module-level helpers ─────────────────────────────────────────────────

/** Returns a valid non-zero integer year, or null if the string is invalid. */
function parseYear(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || String(n) !== trimmed) return null;
  if (n === 0) return null; // year 0 does not exist in proleptic Gregorian
  return n;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchBar({ mode, onSearch }: SearchBarProps) {
  /**
   * `raw` holds what the user has typed in the input. It starts empty (showing
   * the "Enter a year" placeholder) and is cleared again after every submit —
   * the selected year is shown in the header/centre, so the field stays ready
   * for the next entry rather than retaining the typed value.
   */
  const [raw,   setRaw]   = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const isCompact = mode !== 'landing'; // graph and map modes collapse the hero

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const year = parseYear(raw);
    if (year === null) {
      const t = raw.trim();
      setError(
        !t          ? 'Please enter a year.'
        : t === '0' ? 'Year 0 does not exist — use −1 for 1 BCE.'
        : 'Enter a whole number, e.g. 1754 or −44.',
      );
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSearch(year);
    setRaw(''); // reset to the "Enter a year" placeholder for the next entry
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit();
  }

  /** Restrict input to an optional leading minus followed only by digits. */
  function restrictToYearInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (/^-?\d*$/.test(v)) {
      setRaw(v);
      if (error) setError(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="searchbar" data-mode={mode}>

      {/* Hero text — collapses via grid-template-rows when in graph mode */}
      <div className="searchbar-hero-wrapper" aria-hidden={isCompact}>
        <div className="searchbar-hero">
          <h1>Chronograph</h1>
          <p>Explore what was happening everywhere in history, one year at a time.</p>
        </div>
      </div>

      {/* Input row */}
      <div className="searchbar-input-row">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="searchbar-input"
          value={raw}
          onChange={restrictToYearInput}
          onKeyDown={handleKeyDown}
          placeholder="Enter a year, e.g. 1754"
          aria-label="Year to explore"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'search-error' : undefined}
        />

        <button
          type="button"
          className="searchbar-btn"
          onClick={handleSubmit}
          aria-label="Search this year"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Inline error — collapses via grid when no error */}
      <div
        id="search-error"
        className={`searchbar-error-wrapper${error ? ' is-visible' : ''}`}
        role={error ? 'alert' : undefined}
      >
        <div className="searchbar-error-inner">
          <p className="searchbar-error-text">{error}</p>
        </div>
      </div>

    </div>
  );
}
