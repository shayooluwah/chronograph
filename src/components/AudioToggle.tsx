// ── Inline SVG icons ──────────────────────────────────────────────────────────

function SpeakerOnIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" fill="currentColor" />
      <path d="M11.5 6.5a3 3 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" />
      <path d="M13.3 4.7a5.5 5.5 0 0 1 0 8.6" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" fill="currentColor" />
      <path d="M11.5 7l4 4M15.5 7l-4 4" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AudioToggleProps {
  enabled:  boolean;
  onToggle: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Small mute / unmute control for the ambient music. Independent of the
 * light/dark theme — only its colours follow the theme tokens.
 */
export default function AudioToggle({ enabled, onToggle }: AudioToggleProps) {
  const label = enabled ? 'Mute ambient music' : 'Unmute ambient music';
  return (
    <button
      type="button"
      className="audio-toggle"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      data-on={enabled ? 'true' : 'false'}
    >
      {enabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}
