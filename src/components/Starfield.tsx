import { useMemo } from 'react';
import type { CSSProperties } from 'react';

// ── Star configuration ────────────────────────────────────────────────────────

const STAR_COUNT = 300;
const TWINKLE_CHANCE = 0.35; // ~30–40% of stars pulse; the rest stay static

interface Star {
  left: string;        // % position
  top: string;         // % position
  size: number;        // px diameter
  twinkle: boolean;    // does this star pulse?
  opacity: number;     // resting opacity (used when static, and as twinkle peak)
  twMin?: number;      // twinkle trough opacity
  twDur?: number;      // animation-duration (s)
  twDelay?: number;    // animation-delay (s, negative → starts mid-cycle)
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate the star field once. Three weighted size tiers — bigger stars are
 * brighter, reading as nearer. Roughly a third twinkle: each of those gets a
 * randomized duration, a randomized *negative* delay (so they start partway
 * through and stay out of phase), and a randomized opacity range so the depth
 * of the pulse varies star to star. The twinkle itself is pure CSS.
 */
function generateStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => {
    const tier = Math.random();
    let size: number;
    let opacity: number;
    if (tier < 0.05) {          // ~5% large / near
      size    = rand(2.4, 3.4);
      opacity = rand(0.55, 0.8);
    } else if (tier < 0.25) {   // ~20% medium
      size    = rand(1.3, 2.2);
      opacity = rand(0.35, 0.6);
    } else {                    // ~75% small / far
      size    = rand(0.5, 1.2);
      opacity = rand(0.18, 0.4);
    }

    const twinkle = Math.random() < TWINKLE_CHANCE;

    return {
      left:    `${rand(0, 100)}%`,
      top:     `${rand(0, 100)}%`,
      size,
      twinkle,
      opacity,
      ...(twinkle && {
        twMin:   opacity * rand(0.2, 0.55), // dimmer trough; varies per star
        twDur:   rand(2, 7),                // ~2–7 s cycle
        twDelay: -rand(0, 7),               // negative → mid-cycle, out of phase
      }),
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Starfield() {
  const stars = useMemo(generateStars, []);

  return (
    <div className="stars" aria-hidden="true">
      {stars.map((s, i) => {
        const style: CSSProperties = {
          left:   s.left,
          top:    s.top,
          width:  s.size,
          height: s.size,
        };
        if (s.twinkle) {
          // Custom props drive the single generic keyframe; cast for TS.
          (style as Record<string, string | number>)['--tw-min'] = s.twMin!;
          (style as Record<string, string | number>)['--tw-max'] = s.opacity;
          (style as Record<string, string | number>)['--tw-dur'] = `${s.twDur}s`;
          (style as Record<string, string | number>)['--tw-delay'] = `${s.twDelay}s`;
        } else {
          style.opacity = s.opacity;
        }
        return (
          <span
            key={i}
            className={s.twinkle ? 'star star-twinkle' : 'star'}
            style={style}
          />
        );
      })}
    </div>
  );
}
