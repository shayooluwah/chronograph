import { spiral, pathFrom } from '../utils/spiral';

// Geometry is computed once at module load — the mark never changes shape.
const LOADER = spiral(100, 100, 3.9, 5, 160);
const LOADER_D = pathFrom(LOADER);
const LOADER_END = LOADER[LOADER.length - 1];

const MINI = spiral(100, 100, 3.4, 4.2, 120);
const MINI_D = pathFrom(MINI);
const MINI_END = MINI[MINI.length - 1];

interface SpiralMarkProps {
  /** 'loader' — large, thin, slowly spinning inside a static ring.
   *  'mini'   — small, heavy, static; for the brand wordmark. */
  variant?: 'loader' | 'mini';
  className?: string;
}

/**
 * The astrolabe-spiral mark: an Archimedean spiral in indigo ink. Shared by
 * the loading screen and the brand so they read as the same instrument.
 */
export default function SpiralMark({ variant = 'loader', className }: SpiralMarkProps) {
  if (variant === 'mini') {
    return (
      <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="84" fill="none" stroke="var(--text)" strokeWidth="3" />
        <path d={MINI_D} fill="none" stroke="var(--text)" strokeWidth="9" strokeLinecap="round" />
        <circle cx={MINI_END[0]} cy={MINI_END[1]} r="9" fill="var(--text)" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 200 200" role="img" aria-label="Chronograph mark">
      <circle cx="100" cy="100" r="80" fill="none" stroke="var(--text)" strokeWidth="1.1" opacity="0.8" />
      <g className="mark-spin">
        <path
          d={LOADER_D}
          fill="none"
          stroke="var(--text)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={LOADER_END[0]} cy={LOADER_END[1]} r="5" fill="var(--text)" />
        <circle cx="100" cy="100" r="2.6" fill="var(--text)" />
      </g>
    </svg>
  );
}
