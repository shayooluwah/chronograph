import { useEffect, useRef } from 'react';

// ── Star configuration ────────────────────────────────────────────────────────

const STAR_COUNT = 200;

/** Palette of star tints */
const STAR_COLORS = ['#ffffff', '#c8d8ff', '#d8c8ff'] as const;

interface Star {
  x: number;          // canvas-relative position [0, 1]
  y: number;          // canvas-relative position [0, 1]
  radius: number;     // px, 0.5 – 2.5
  baseOpacity: number;// centre of sine oscillation, 0.3 – 1.0
  amplitude: number;  // swing above/below baseOpacity (clamped to [0,1] at draw time)
  phase: number;      // initial sine phase offset (radians)
  speed: number;      // radians per millisecond (full cycle 3–8 s)
  color: string;      // one of STAR_COLORS
}

/** Generate the star field once. Positions are stored as [0,1] fractions so
 *  the same set survives canvas resizes without regeneration. */
function generateStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => {
    const baseOpacity = 0.3 + Math.random() * 0.7;        // 0.3 – 1.0
    const amplitude   = Math.min(baseOpacity, 1 - baseOpacity, 0.25); // keep clamped
    const cycleSecs   = 3 + Math.random() * 5;             // 3 – 8 s

    return {
      x:           Math.random(),
      y:           Math.random(),
      radius:      0.5 + Math.random() * 2.0,              // 0.5 – 2.5
      baseOpacity,
      amplitude,
      phase:       Math.random() * Math.PI * 2,
      speed:       (Math.PI * 2) / (cycleSecs * 1000),     // rad / ms
      color:       STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Primary vertical gradient: near-black → deep navy
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0,    '#0a0a1a');
  skyGrad.addColorStop(0.55, '#0d0b2e');
  skyGrad.addColorStop(1,    '#0a0a1a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Nebula glow — upper-right quadrant
  const nebulaX  = w * 0.75;
  const nebulaY  = h * 0.28;
  const nebulaR  = Math.max(w, h) * 0.45;
  const nebula   = ctx.createRadialGradient(nebulaX, nebulaY, 0, nebulaX, nebulaY, nebulaR);
  nebula.addColorStop(0,   'rgba(80, 20, 120, 0.15)');
  nebula.addColorStop(0.6, 'rgba(80, 20, 120, 0.04)');
  nebula.addColorStop(1,   'rgba(80, 20, 120, 0)');
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  w: number,
  h: number,
  timestamp: number,
): void {
  for (const star of stars) {
    const opacity = Math.min(
      1,
      Math.max(0, star.baseOpacity + star.amplitude * Math.sin(star.phase + timestamp * star.speed)),
    );

    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.radius, 0, Math.PI * 2);

    // Tiny soft glow: draw a larger, very faint circle first
    if (star.radius > 1.4) {
      ctx.shadowColor  = star.color;
      ctx.shadowBlur   = star.radius * 3;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = star.color;
    ctx.globalAlpha = opacity;
    ctx.fill();
  }

  // Reset compositing state
  ctx.globalAlpha  = 1;
  ctx.shadowBlur   = 0;
  ctx.shadowColor  = 'transparent';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate stars once; they live for the lifetime of the component
    const stars = generateStars();

    // ── Resize handler ──────────────────────────────────────────────────────
    let rafId = 0;

    function syncSize(): void {
      canvas!.width  = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    syncSize();

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
      // No need to re-draw immediately; the rAF loop picks it up on the next tick
    });
    resizeObserver.observe(document.documentElement);

    // ── Animation loop ──────────────────────────────────────────────────────
    function frame(timestamp: number): void {
      const w = canvas!.width;
      const h = canvas!.height;

      ctx!.clearRect(0, 0, w, h);
      drawBackground(ctx!, w, h);
      drawStars(ctx!, stars, w, h, timestamp);

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // react-doctor-disable-next-line react-doctor/no-aria-hidden-on-focusable -- <canvas> has no tabIndex, it is not focusable; aria-hidden is correct for decorative content
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
