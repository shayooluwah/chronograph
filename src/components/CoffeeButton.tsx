import { KOFI_URL } from '../constants/support';

// ── Cup icon ──────────────────────────────────────────────────────────────────

function CupIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h12v4.5A5.5 5.5 0 0 1 10.5 19h-1A5.5 5.5 0 0 1 4 13.5z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 2.8c0 1.3 1.2 1.3 1.2 2.6M12 2.8c0 1.3 1.2 1.3 1.2 2.6" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Quiet "Buy me a coffee" link to Ko-fi, styled to sit with the dice / sound
 *  buttons. Opens in a new tab so the current year stays open. */
export default function CoffeeButton() {
  const label = 'Buy me a coffee on Ko-fi';
  return (
    <a
      className="coffee-btn"
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <CupIcon />
    </a>
  );
}
