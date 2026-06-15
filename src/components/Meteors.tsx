import { useEffect, useRef } from 'react';

// ── Meteor shower ──────────────────────────────────────────────────────────────
// Dark-mode only. Each meteor is a thin streak driven entirely by CSS custom
// properties so the keyframes stay generic; we only ever animate transform +
// opacity (never width/top/left per frame). Spawned on a jittered timer with a
// low concurrency cap, each removed on animationend.

const MAX_METEORS = 6;          // hard cap on concurrent streaks
const SPAWN_MIN   = 450;        // ms — fastest cadence between spawns
const SPAWN_MAX   = 2000;       // ms — slowest cadence
const DUR_MIN     = 0.5;        // s — fast "zoom"
const DUR_MAX     = 4;          // s — slow "glide"

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export default function Meteors() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return; // static stars remain; no meteors

    let active = 0;
    let timer = 0;
    let stopped = false;

    function spawn(): void {
      if (active >= MAX_METEORS) return;

      const el = document.createElement('div');
      el.className = 'meteor';

      const ang  = rand(15, 165);                 // travel angle (downward-ish)
      const dist = rand(320, 700);                // px travelled
      const dur  = rand(DUR_MIN, DUR_MAX);        // s — speed
      const t    = (dur - DUR_MIN) / (DUR_MAX - DUR_MIN); // 0 fast .. 1 slow
      const len  = 220 - t * 150;                 // tail: ~220px fast .. ~70px slow
      const bright = 1 - t * 0.45;                // faster reads brighter

      el.style.setProperty('--ang',    `${ang}deg`);
      el.style.setProperty('--dist',   `${dist}px`);
      el.style.setProperty('--dur',    `${dur}s`);
      el.style.setProperty('--len',    `${len}px`);
      el.style.setProperty('--bright', `${bright}`);
      el.style.left = `${rand(0, 100)}vw`;
      el.style.top  = `${rand(-5, 55)}vh`;

      el.addEventListener('animationend', () => {
        el.remove();
        active--;
      });

      layer!.appendChild(el);
      active++;
    }

    function schedule(): void {
      if (stopped) return;
      timer = window.setTimeout(() => {
        spawn();
        schedule();
      }, rand(SPAWN_MIN, SPAWN_MAX));
    }
    schedule();

    return () => {
      stopped = true;
      clearTimeout(timer);
      layer.replaceChildren();
    };
  }, []);

  return <div ref={layerRef} className="meteors" aria-hidden="true" />;
}
