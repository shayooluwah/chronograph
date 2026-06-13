/**
 * Archimedean spiral — the celestial instrument mark used by the loader and
 * the brand. Returns `steps + 1` points winding out from (cx, cy).
 */
export function spiral(
  cx: number,
  cy: number,
  b: number,
  turns: number,
  steps: number,
): [number, number][] {
  const tmax = turns * Math.PI;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (tmax * i) / steps;
    const r = b * t;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

/** Build an SVG path `d` string from a list of points. */
export function pathFrom(pts: [number, number][]): string {
  return 'M ' + pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ');
}
