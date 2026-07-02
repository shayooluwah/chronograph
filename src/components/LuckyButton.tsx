// ── Die icon ──────────────────────────────────────────────────────────────────

function DiceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="13" height="13" rx="3.2"
            stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6"  cy="6"  r="1.15" fill="currentColor" />
      <circle cx="12" cy="6"  r="1.15" fill="currentColor" />
      <circle cx="9"  cy="9"  r="1.15" fill="currentColor" />
      <circle cx="6"  cy="12" r="1.15" fill="currentColor" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LuckyButtonProps {
  onClick:   () => void;
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/** "I'm feeling lucky" — jumps to a random year with the usual travel transition. */
export default function LuckyButton({ onClick, disabled }: LuckyButtonProps) {
  const label = 'Jump to a random year';
  return (
    <button
      type="button"
      className="lucky-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <DiceIcon />
    </button>
  );
}
