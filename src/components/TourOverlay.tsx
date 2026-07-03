import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * First-run onboarding walkthrough. Fully self-contained: it decides on its own
 * whether to appear (once per user, keyed in localStorage), renders a modal
 * backdrop + card, and highlights the real UI controls with a moving ring.
 *
 * Drop-in: <TourOverlay /> anywhere near the top of the app tree. It reads the
 * live DOM (via selectors) to position the ring, so it doesn't need any props or
 * refs from the surrounding layout.
 */

const STORAGE_KEY   = 'chronograph_tour_seen';
const SHOW_DELAY_MS  = 800; // let the app paint before the tour appears
const RING_PAD       = 5;   // px of breathing room around a highlighted target

// ── Inline SVG icons (currentColor, matching the app's hand-drawn set) ─────────

function PlanetIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="10" ry="3.4" stroke="currentColor" strokeWidth="1.5"
               transform="rotate(-22 12 12)" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="12" x2="16.4" y2="16.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="5.7" x2="8" y2="10.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.7" y1="8" x2="10.3" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="13" height="13" rx="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6"  cy="6"  r="1.15" fill="currentColor" />
      <circle cx="12" cy="6"  r="1.15" fill="currentColor" />
      <circle cx="9"  cy="9"  r="1.15" fill="currentColor" />
      <circle cx="6"  cy="12" r="1.15" fill="currentColor" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="9"    y1="1.6"  x2="9"    y2="3.1" />
        <line x1="9"    y1="14.9" x2="9"    y2="16.4" />
        <line x1="1.6"  y1="9"    x2="3.1"  y2="9" />
        <line x1="14.9" y1="9"    x2="16.4" y2="9" />
        <line x1="3.9"  y1="3.9"  x2="4.95" y2="4.95" />
        <line x1="13.05" y1="13.05" x2="14.1" y2="14.1" />
        <line x1="14.1" y1="3.9"  x2="13.05" y2="4.95" />
        <line x1="4.95" y1="13.05" x2="3.9"  y2="14.1" />
      </g>
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 7v4h2.5L9 14V4L5.5 7H3Z" fill="currentColor" />
      <path d="M11.5 7l4 4M15.5 7l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CircleCheckIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.4l2.6 2.6L16 9.2" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Step definitions ───────────────────────────────────────────────────────────

interface Chip { text: string; }

interface TourStep {
  heading: string;
  body:    string;
  /** Selector for the live UI element the ring highlights. */
  target:  string;
  iconRow?:     { icon: ReactNode; label: string };
  chips?:       Chip[];
  chipVariant?: 'accent' | 'violet';
  footnote?:    string;
}

const STEPS: TourStep[] = [
  {
    heading: 'Zoom in and out',
    body:    'Use the + / − buttons in the top-right to zoom the graph. On a touchscreen, pinch to zoom. On desktop, scroll with your mouse wheel.',
    target:  '.zoom-controls',
    iconRow: { icon: <ZoomInIcon />, label: '+ to zoom in · − to zoom out' },
  },
  {
    heading: "I'm feeling lucky",
    body:    "Not sure where to start? Hit the I'm feeling lucky button at the bottom and Chronograph loads a random significant year for you.",
    target:  '.lucky-btn',
    iconRow: { icon: <DiceIcon />, label: 'Loads a surprise year' },
  },
  {
    heading: 'Dark and light mode',
    body:    'Toggle between dark and light mode using the sun/moon icon in the top-left. Your preference is saved automatically.',
    target:  '.theme-toggle',
    iconRow: { icon: <SunIcon />, label: 'Toggle appearance' },
  },
  {
    heading: 'Enter any year',
    body:    'Type any AD year into the centre input and press Enter. Chronograph pulls historical events from that year and builds the graph around it.',
    target:  '.searchbar-input',
    chips:       [{ text: '1969' }, { text: '1453' }, { text: '2001' }, { text: '1776' }],
    chipVariant: 'accent',
  },
  {
    heading: 'Exploring BC years',
    body:    'To explore a year Before Christ, enter it as a negative number. Chronograph converts it automatically.',
    target:  '.searchbar-input',
    chips:       [{ text: '−44 → 44 BC' }, { text: '−776 → 776 BC' }, { text: '−3000 → 3000 BC' }],
    chipVariant: 'violet',
    footnote:    'Year 1 is the earliest AD year — there is no year zero.',
  },
  {
    heading: 'Mute the audio',
    body:    'Chronograph plays ambient audio while you explore. Use the volume icon in the bottom-right to mute or unmute at any time.',
    target:  '.audio-toggle',
    iconRow: { icon: <VolumeOffIcon />, label: 'Mute or unmute ambient sound' },
  },
];

const STEP_COUNT = STEPS.length; // 6

// 'welcome' → intro; 0..5 → steps 1–6; 'done' → outro.
type View = 'welcome' | 'done' | number;

interface RingRect { top: number; left: number; width: number; height: number; }

// ── Component ───────────────────────────────────────────────────────────────────

export default function TourOverlay() {
  const [visible,  setVisible]  = useState(false);
  const [view,     setView]     = useState<View>('welcome');
  const [ringRect, setRingRect] = useState<RingRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isStep = typeof view === 'number';

  // First-visit gate: show once, after a short delay so the app can paint first.
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(STORAGE_KEY) !== null; } catch { /* storage blocked */ }
    if (seen) return;
    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  /** Complete or dismiss — never show the tour again for this user. */
  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* storage blocked */ }
    setVisible(false);
  }

  // Track the highlighted target's box, and keep it in sync on resize / scroll so
  // the ring rides along with the real control. Only active on steps 1–6; the
  // render gates the ring on `isStep`, so a stale rect from the previous step
  // simply animates to the new position (never shows on welcome / done). The
  // first measure is deferred to rAF so the ring eases between steps rather than
  // snapping, and so state isn't set synchronously inside the effect.
  useEffect(() => {
    if (!visible || typeof view !== 'number') return;
    const { target } = STEPS[view];
    const update = () => {
      const el = document.querySelector(target);
      if (!el) { setRingRect(null); return; }
      const r = el.getBoundingClientRect();
      setRingRect({
        top:    r.top    - RING_PAD,
        left:   r.left   - RING_PAD,
        width:  r.width  + RING_PAD * 2,
        height: r.height + RING_PAD * 2,
      });
    };
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, view]);

  // Escape dismisses (counts as completion so it won't reappear).
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  // Move focus to the primary action whenever the screen changes.
  useEffect(() => {
    if (!visible) return;
    cardRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus();
  }, [visible, view]);

  if (!visible) return null;

  const step = typeof view === 'number' ? STEPS[view] : null;

  return (
    <div
      className="chrono-tour"
      data-mode={isStep ? 'step' : 'plain'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chrono-tour-heading"
    >
      {/* Highlight ring — its huge box-shadow dims everything outside it. */}
      {isStep && ringRect && (
        <div
          className="chrono-tour-ring"
          aria-hidden="true"
          style={{
            top:    ringRect.top,
            left:   ringRect.left,
            width:  ringRect.width,
            height: ringRect.height,
          }}
        />
      )}

      <div className="chrono-tour-card" ref={cardRef}>
        {/* ── Welcome ─────────────────────────────────────────────────────── */}
        {view === 'welcome' && (
          <>
            <span className="chrono-tour-icon" aria-hidden="true"><PlanetIcon /></span>
            <h2 id="chrono-tour-heading" className="chrono-tour-heading">Welcome to Chronograph</h2>
            <p className="chrono-tour-body">A quick tour of the key controls — takes about 45 seconds.</p>
            <div className="chrono-tour-actions">
              <button type="button" className="chrono-tour-btn-text" onClick={dismiss}>
                Skip tour
              </button>
              <button type="button" className="chrono-tour-btn-primary" data-autofocus onClick={() => setView(0)}>
                Show me around
              </button>
            </div>
          </>
        )}

        {/* ── Steps 1–6 ───────────────────────────────────────────────────── */}
        {step && typeof view === 'number' && (
          <>
            <span className="chrono-tour-badge">{view + 1} of {STEP_COUNT}</span>
            <h2 id="chrono-tour-heading" className="chrono-tour-heading">{step.heading}</h2>
            <p className="chrono-tour-body">{step.body}</p>

            {step.iconRow && (
              <div className="chrono-tour-iconrow">
                <span className="chrono-tour-iconrow-icon">{step.iconRow.icon}</span>
                <span>{step.iconRow.label}</span>
              </div>
            )}

            {step.chips && (
              <div className="chrono-tour-chips">
                {step.chips.map(c => (
                  <span key={c.text} className="chrono-tour-chip" data-variant={step.chipVariant}>
                    {c.text}
                  </span>
                ))}
              </div>
            )}

            {step.footnote && <p className="chrono-tour-footnote">{step.footnote}</p>}

            <div className="chrono-tour-footer">
              <div className="chrono-tour-dots" aria-hidden="true">
                {STEPS.map((_, i) => (
                  <span key={i} className="chrono-tour-dot" data-active={i === view ? 'true' : 'false'} />
                ))}
              </div>
              <div className="chrono-tour-nav">
                <button
                  type="button"
                  className="chrono-tour-btn-secondary"
                  onClick={() => setView(view === 0 ? 'welcome' : view - 1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="chrono-tour-btn-primary"
                  data-autofocus
                  onClick={() => setView(view === STEP_COUNT - 1 ? 'done' : view + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Done ────────────────────────────────────────────────────────── */}
        {view === 'done' && (
          <>
            <span className="chrono-tour-icon" data-accent="true" aria-hidden="true"><CircleCheckIcon /></span>
            <h2 id="chrono-tour-heading" className="chrono-tour-heading">You're all set</h2>
            <p className="chrono-tour-body">
              Explore any year in history — from 3000 BC to today. This tour won't show again.
            </p>
            <div className="chrono-tour-actions">
              <button type="button" className="chrono-tour-btn-secondary" onClick={() => setView(STEP_COUNT - 1)}>
                Back
              </button>
              <button type="button" className="chrono-tour-btn-primary" data-autofocus onClick={dismiss}>
                Start exploring
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
