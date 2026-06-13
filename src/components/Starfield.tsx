import { useEffect, useRef } from 'react';

// ── Star configuration ────────────────────────────────────────────────────────

const STAR_COUNT = 300;
const STAR_COLOR = '#F2EAD0'; // soft cream — the dark theme's --text

interface Star {
  x: number;          // canvas-relative position [0, 1]
  y: number;          // canvas-relative position [0, 1]
  radius: number;     // px
  baseOpacity: number;// resting opacity (brighter for larger/nearer stars)
  twinkle: boolean;   // does this star pulse?
  amplitude: number;  // opacity swing when twinkling
  phase: number;      // initial sine phase (radians)
  speed: number;      // radians per millisecond (full cycle 3–6 s)
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate the star field once. Three weighted size tiers — bigger stars are
 * brighter, reading as nearer. Positions are [0,1] fractions so the same field
 * survives canvas resizes without regeneration.
 */
function generateStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => {
    const tier = Math.random();
    let radius: number;
    let baseOpacity: number;
    if (tier < 0.05) {          // ~5% large / near
      radius      = rand(2.4, 3.4);
      baseOpacity = rand(0.55, 0.8);
    } else if (tier < 0.25) {   // ~20% medium
      radius      = rand(1.3, 2.2);
      baseOpacity = rand(0.35, 0.6);
    } else {                    // ~75% small / far
      radius      = rand(0.5, 1.2);
      baseOpacity = rand(0.18, 0.4);
    }

    const twinkle   = Math.random() < 0.11; // ~11% slowly pulse
    const cycleSecs = rand(3, 6);

    return {
      x:           Math.random(),
      y:           Math.random(),
      radius,
      baseOpacity,
      twinkle,
      amplitude:   Math.min(baseOpacity, 1 - baseOpacity, 0.22),
      phase:       Math.random() * Math.PI * 2,
      speed:       (Math.PI * 2) / (cycleSecs * 1000),
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = generateStars();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;

    function syncSize(): void {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width  = Math.floor(window.innerWidth  * dpr);
      canvas!.height = Math.floor(window.innerHeight * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    syncSize();

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(document.documentElement);

    function draw(timestamp: number): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = STAR_COLOR;

      for (const s of stars) {
        const opacity = s.twinkle && !reduceMotion
          ? Math.min(1, Math.max(0, s.baseOpacity + s.amplitude * Math.sin(s.phase + timestamp * s.speed)))
          : s.baseOpacity;
        ctx!.globalAlpha = opacity;
        ctx!.beginPath();
        ctx!.arc(s.x * w, s.y * h, s.radius, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    if (reduceMotion) {
      draw(0); // single static paint
    } else {
      const loop = (t: number) => { draw(t); rafId = requestAnimationFrame(loop); };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="stars" aria-hidden="true" />;
}
