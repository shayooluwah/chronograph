import { useEffect, useReducer, useRef } from 'react';
import * as d3 from 'd3';
import type { YearMapProps } from '../types';

// ── Palette as live CSS-variable references — nodes follow the theme toggle ────

const TEXT = 'var(--text)';
const BG   = 'var(--bg)';
const LINE = 'var(--line)';
const HOVER_WASH = 'color-mix(in srgb, var(--text) 12%, transparent)';

// ── Spiral geometry ───────────────────────────────────────────────────────────
//
// The map is an infinite, deterministic coordinate space: every year owns a
// fixed point on an Archimedean spiral, so panning/zooming just moves the
// camera over a world that never changes. CENTER_YEAR is a FIXED, persisted
// anchor — it must never be recomputed per session, since the entire layout is
// relative to it and recentring would reshuffle every node.

const CENTER_YEAR = 1900;
const R0          = 140;  // radius of the innermost ring (world px)
const RADIAL_K    = 42;   // world px added to the radius per year from centre
const THETA_STEP  = 0.5;  // radians of rotation per year

/** Small deterministic per-year offset: hashing the year gives an organic
 *  wobble that is identical on every render, so positions stay stable. */
const JITTER = 9;
function hashJitter(year: number, salt: number): number {
  const s = Math.sin((year + 1) * (12.9898 + salt) + salt * 78.233) * 43758.5453;
  return ((s - Math.floor(s)) * 2 - 1) * JITTER;
}

/** Deterministic world-space position for a year. Future years spiral one
 *  angular direction, past years the other, both growing out of the same core,
 *  so consecutive years stay spatial neighbours and panning outward travels
 *  further from CENTER_YEAR. */
export function yearToPosition(year: number): { x: number; y: number } {
  const n     = year - CENTER_YEAR;
  const theta = n * THETA_STEP;
  const r     = R0 + RADIAL_K * Math.abs(n);
  return {
    x: r * Math.cos(theta) + hashJitter(year, 1),
    y: r * Math.sin(theta) + hashJitter(year, 2),
  };
}

// ── Bounds helpers ────────────────────────────────────────────────────────────

interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

function inBounds(p: { x: number; y: number }, b: Bounds, margin = 0): boolean {
  return p.x >= b.minX - margin && p.x <= b.maxX + margin
      && p.y >= b.minY - margin && p.y <= b.maxY + margin;
}

/** Distance from the spiral core (world origin) to the furthest rect corner. */
function furthestCornerDistanceFromCenter(b: Bounds): number {
  let max = 0;
  for (const x of [b.minX, b.maxX]) {
    for (const y of [b.minY, b.maxY]) max = Math.max(max, Math.hypot(x, y));
  }
  return max;
}

// ── Container dims (resize → effect re-run, no React re-render) ────────────────

function useContainerDims(ref: React.RefObject<HTMLDivElement | null>) {
  const dimsRef = useRef({ w: 0, h: 0 });
  const [renderKey, bumpRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    dimsRef.current = { w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) };
    bumpRender();
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      dimsRef.current = { w: Math.floor(width), h: Math.floor(height) };
      bumpRender();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);

  return { dimsRef, renderKey };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function YearMap({ visitedYears, lastVisitedYear, onYearSelect }: YearMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  // Keep callback / visited set current without re-running the heavy D3 effect.
  const onSelectRef = useRef(onYearSelect);
  useEffect(() => { onSelectRef.current = onYearSelect; }, [onYearSelect]);
  const visitedRef = useRef(visitedYears);
  useEffect(() => { visitedRef.current = visitedYears; }, [visitedYears]);

  /** Camera transform, persisted across resize-driven rebuilds so a resize
   *  doesn't fling the viewport back to the core. */
  const transformRef = useRef<d3.ZoomTransform | null>(null);

  /** Fly the camera to a year — (re)assigned by the render effect so it always
   *  closes over the live zoom behaviour. */
  const flyToRef = useRef<((year: number) => void) | null>(null);

  const { dimsRef, renderKey } = useContainerDims(containerRef);

  // ── D3 render ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
    const dims  = dimsRef.current;
    if (!svgEl || dims.w === 0 || dims.h === 0) return;

    const { w, h } = dims;
    const isMobile = w < 768;
    const RX = isMobile ? 30 : 40; // ellipse horizontal radius
    const RY = isMobile ? 17 : 22; // ellipse vertical radius
    const nodeMargin = Math.max(RX, RY);

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    const scene     = svg.append('g').attr('class', 'scene');
    const linkLayer = scene.append('g').attr('class', 'links');
    const nodeLayer = scene.append('g').attr('class', 'nodes');

    const isVisited = (year: number) => visitedRef.current.has(year);
    // Unvisited years read as outlines; visited/focused years fill with --text
    // and carry --bg-coloured numerals so they stay legible in either theme.
    const bodyFill = (year: number) => (isVisited(year) ? TEXT : 'none');
    const textFill = (year: number) => (isVisited(year) ? BG : TEXT);

    // Currently mounted years (year → fixed position) and their live, lerped
    // opacity for the proximity fade.
    const mounted = new Map<number, { x: number; y: number }>();
    const opacity = new Map<number, number>();

    let navigating = false; // true while a zoom-into-node exit is playing

    // ── Zoom / pan ────────────────────────────────────────────────────────────

    const BUFFER     = 0.4; // expand the visible rect by 40% for generation
    const HYSTERESIS = 80;  // extra px a node must leave before it unmounts

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        transformRef.current = e.transform;
        scene.attr('transform', e.transform.toString());
        scheduleRegen();
      });

    svg.call(zoom).on('dblclick.zoom', null);

    function transformFor(year: number, k: number): d3.ZoomTransform {
      const p = yearToPosition(year);
      return d3.zoomIdentity.translate(w / 2 - k * p.x, h / 2 - k * p.y).scale(k);
    }

    function visibleWorldBounds(): Bounds {
      const t = transformRef.current ?? d3.zoomIdentity;
      const [x0, y0] = t.invert([0, 0]);
      const [x1, y1] = t.invert([w, h]);
      return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
    }

    function generationBounds(): Bounds {
      const b  = visibleWorldBounds();
      const ex = (b.maxX - b.minX) * BUFFER;
      const ey = (b.maxY - b.minY) * BUFFER;
      return { minX: b.minX - ex, minY: b.minY - ey, maxX: b.maxX + ex, maxY: b.maxY + ey };
    }

    // ── Generation + culling ──────────────────────────────────────────────────

    let regenScheduled = false;
    function scheduleRegen() {
      if (regenScheduled) return;
      regenScheduled = true;
      requestAnimationFrame(() => { regenScheduled = false; regenerate(); });
    }

    function regenerate() {
      const gen     = generationBounds();
      const maxDist = furthestCornerDistanceFromCenter(gen);
      // r is monotonic in |n|, so the candidate set is bounded directly.
      const nMax = Math.ceil((maxDist - R0) / RADIAL_K) + 2; // +2 absorbs jitter

      // Mount any year whose deterministic position falls inside the gen rect.
      for (let n = -nMax; n <= nMax; n++) {
        const year = CENTER_YEAR + n;
        const p    = yearToPosition(year);
        if (inBounds(p, gen, nodeMargin) && !mounted.has(year)) {
          mounted.set(year, p);
          opacity.set(year, 0); // fade in as the viewport nears
        }
      }

      // Unmount years that have left the gen rect plus a hysteresis margin, so
      // nodes hovering on the edge don't flicker in and out.
      for (const year of [...mounted.keys()]) {
        if (!inBounds(mounted.get(year)!, gen, nodeMargin + HYSTERESIS)) {
          mounted.delete(year);
          opacity.delete(year);
        }
      }

      joinNodes();
      joinLinks();
    }

    // ── Data joins ────────────────────────────────────────────────────────────

    function joinNodes() {
      const sel = nodeLayer.selectAll<SVGGElement, number>('g.year-node')
        .data([...mounted.keys()], d => d);

      sel.exit().remove();

      const enter = sel.enter().append('g')
        .attr('class',     'year-node')
        .style('cursor',   'pointer')
        .attr('transform', d => { const p = yearToPosition(d); return `translate(${p.x},${p.y})`; })
        .attr('opacity',   0)
        .on('pointerenter', onPointerEnter)
        .on('pointerleave', onPointerLeave)
        .on('click',        onNodeClick);

      // Visited marker: faint outer ring behind the filled body
      enter.filter(d => isVisited(d)).append('ellipse')
        .attr('class',        'visited-ring')
        .attr('rx',           RX + 7)
        .attr('ry',           RY + 7)
        .attr('fill',         'none')
        .attr('stroke',       LINE)
        .attr('stroke-width', 1);

      enter.append('ellipse')
        .attr('class',        'node-body')
        .attr('rx',           RX)
        .attr('ry',           RY)
        .attr('fill',         d => bodyFill(d))
        .attr('stroke',       TEXT)
        .attr('stroke-width', 1.4);

      enter.append('text')
        .attr('text-anchor',       'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill',              d => textFill(d))
        .attr('class',             'year-node-label')
        .attr('font-size',         isMobile ? '12px' : '14px')
        .attr('pointer-events',    'none')
        .text(d => String(d));
    }

    function joinLinks() {
      // Hairline spiral connectors only between mounted consecutive years.
      const pairs: number[] = [];
      for (const year of mounted.keys()) if (mounted.has(year + 1)) pairs.push(year);

      const sel = linkLayer.selectAll<SVGLineElement, number>('line').data(pairs, d => d);
      sel.exit().remove();
      sel.enter().append('line')
        .attr('stroke',       LINE)
        .attr('stroke-width', 1.1)
        .merge(sel)
        .attr('x1', d => yearToPosition(d).x)
        .attr('y1', d => yearToPosition(d).y)
        .attr('x2', d => yearToPosition(d + 1).x)
        .attr('y2', d => yearToPosition(d + 1).y);
    }

    // ── Interactions ──────────────────────────────────────────────────────────

    function onPointerEnter(this: SVGGElement, _: unknown, year: number) {
      if (navigating) return;
      // Fill is a var()/color-mix value d3 can't interpolate — set it instantly,
      // animate only the scale.
      d3.select(this).select('ellipse.node-body')
        .attr('fill', isVisited(year) ? TEXT : HOVER_WASH)
        .interrupt()
        .transition().duration(130).ease(d3.easeCubicOut)
        .attr('transform', 'scale(1.15)');
    }

    function onPointerLeave(this: SVGGElement, _: unknown, year: number) {
      if (navigating) return;
      d3.select(this).select('ellipse.node-body')
        .attr('fill', bodyFill(year))
        .interrupt()
        .transition().duration(130).ease(d3.easeCubicOut)
        .attr('transform', 'scale(1)');
    }

    function onNodeClick(this: SVGGElement, ev: Event, year: number) {
      (ev as MouseEvent).stopPropagation();
      if (navigating) return;
      navigating = true;

      const chosen = d3.select(this);
      chosen.raise();

      const ZOOM_MS = 400;
      chosen.select('ellipse.node-body')
        .interrupt()
        .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
        .attr('transform', 'scale(2.8)');
      chosen
        .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
        .attr('opacity', 0)
        .on('end', () => {
          onSelectRef.current(year);
          // If navigation succeeds the map unmounts. If the fetch fails the
          // view stays here, so restore the node and re-enable interaction.
          window.setTimeout(() => {
            navigating = false;
            chosen.select('ellipse.node-body')
              .interrupt().transition().duration(300).attr('transform', 'scale(1)');
            chosen.interrupt().transition().duration(300).attr('opacity', 1);
          }, 1200);
        });
    }

    // ── Proximity fade (one timer, lerps every mounted node toward its target
    //    opacity so years emerge as the viewport nears them) ─────────────────

    const fadeTimer = d3.timer(() => {
      if (navigating) return;
      const t = transformRef.current ?? d3.zoomIdentity;
      const [centerX, centerY] = t.invert([w / 2, h / 2]);
      const b    = visibleWorldBounds();
      const visR = 0.5 * Math.min(b.maxX - b.minX, b.maxY - b.minY); // inside viewport
      const bufR = visR * (1 + BUFFER);                              // out in the buffer ring

      nodeLayer.selectAll<SVGGElement, number>('g.year-node').each(function (year) {
        const p = yearToPosition(year);
        const d = Math.hypot(p.x - centerX, p.y - centerY);
        const target = d <= visR ? 1
          : d >= bufR ? 0.15
          : 1 - 0.85 * ((d - visR) / (bufR - visR));
        const next = (opacity.get(year) ?? 0) + (target - (opacity.get(year) ?? 0)) * 0.15;
        opacity.set(year, next);
        d3.select(this).attr('opacity', next);
      });

      // Connectors fade with the dimmer of their two endpoints.
      linkLayer.selectAll<SVGLineElement, number>('line')
        .attr('opacity', d => Math.min(opacity.get(d) ?? 0, opacity.get(d + 1) ?? 0));
    });

    // ── Camera: restore on resize, otherwise open on the core ─────────────────

    flyToRef.current = (year: number) => {
      svg.transition().duration(800).ease(d3.easeCubicInOut)
        .call(zoom.transform, transformFor(year, 1));
    };

    const initial = transformRef.current ?? transformFor(CENTER_YEAR, 1);
    svg.call(zoom.transform, initial); // fires the zoom handler → sets transform + regen

    // ── Cleanup ───────────────────────────────────────────────────────────────

    return () => {
      flyToRef.current = null;
      fadeTimer.stop();
      svg.on('.zoom', null);
    };

    // dimsRef is stable; visited/onSelect are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  // Fly the camera to the most recently visited year (e.g. when returning to
  // the map after viewing a year) — the world is fixed, only the camera moves.
  useEffect(() => {
    if (lastVisitedYear !== null) flyToRef.current?.(lastVisitedYear);
  }, [lastVisitedYear]);

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="year-map-container">
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label="Infinite map of explorable years — pan or zoom to roam, select a year to view its events"
        role="img"
      />
    </div>
  );
}
