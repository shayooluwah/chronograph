import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { categoryColor } from '../utils/colors';
import ZoomControls from './ZoomControls';
import type { GraphProps, NodeDatum } from '../types';

// Structural colours as live CSS-variable references, so the instrument
// recolours instantly when the theme toggles (no re-render required).
const TEXT = 'var(--text)';
const LINE = 'var(--line)';
const BG   = 'var(--bg)';

// ── Astrolabe geometry (fixed viewBox; SVG scales it to any container) ─────────

const VB_W = 1100;
const VB_H = 620;
const CX   = 550;
const CY   = 305;

const GUIDE_RINGS = [150, 210, 265]; // hairline guide rings; the middle one dashes
const OUTER_RING  = 300;             // heavier outer ring
const SHELLS      = [156, 196, 236]; // staggered orbits, cycled by index

const MOBILE_BP = 768;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Graph({ events, year, onEventSelect }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Narrow viewports get shorter labels (less edge-clipping under the viewBox
  // down-scale), a larger relative label font, and a smaller centre year so it
  // doesn't swamp the instrument. Tracked as state so a rotate/resize re-renders.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BP,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BP);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** The live zoom behaviour, so the +/− buttons can drive the same transform
   *  the scroll/pinch gestures use. */
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  /** Keep the callback in a ref so the heavyweight D3 effect does NOT re-run
   *  on every parent re-render with a new arrow-function identity. */
  const onSelectRef = useRef(onEventSelect);
  useEffect(() => { onSelectRef.current = onEventSelect; }, [onEventSelect]);

  /** scaleBy through the zoom behaviour so scaleExtent clamping is automatic. */
  function handleZoom(factor: number) {
    const svgEl = svgRef.current;
    const zoom  = zoomRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(200).call(zoom.scaleBy, factor);
  }

  // ── D3 render ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // Viewport-derived sizing (viewBox units). Larger label font + bigger
    // line-height on mobile so labels survive the down-scale; shorter truncation
    // so they don't run past the viewBox edges.
    const NODE_R     = isMobile ? 9    : 7.5;
    const LABEL_FONT = isMobile ? 15   : 11.5;
    const LINE_H     = isMobile ? 19   : 14;   // min vertical gap between labels
    const LABEL_PAD  = NODE_R + 5.5;
    const MAX_LABEL  = isMobile ? 12   : 20;
    const YEAR_FONT  = isMobile ? 96   : 118;
    const truncate = (s: string) =>
      s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + '…' : s;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // ── Zoom / pan ──────────────────────────────────────────────────────────
    const scene = svg.append('g').attr('class', 'scene');

    const zoomBehaviour = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5])
      // A tap that drifts < 10px still counts as a click, not a swallowed pan.
      .clickDistance(10)
      .on('zoom', (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        scene.attr('transform', e.transform.toString());
      });

    svg.call(zoomBehaviour).on('dblclick.zoom', null);
    zoomRef.current = zoomBehaviour;

    // ── Instrument: rings, ticks, outer ring ─────────────────────────────────
    const instrument = scene.append('g').attr('class', 'instrument');

    GUIDE_RINGS.forEach(r => {
      instrument.append('circle')
        .attr('cx', CX).attr('cy', CY).attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', LINE)
        .attr('stroke-dasharray', r === GUIDE_RINGS[1] ? '2 6' : 'none');
    });

    // Tick ring: 72 ticks, every 6th longer (clock / astrolabe feel)
    for (let i = 0; i < 72; i++) {
      const a  = (i / 72) * 2 * Math.PI;
      const r1 = 292;
      const r2 = i % 6 === 0 ? 276 : 284;
      instrument.append('line')
        .attr('x1', CX + r1 * Math.cos(a)).attr('y1', CY + r1 * Math.sin(a))
        .attr('x2', CX + r2 * Math.cos(a)).attr('y2', CY + r2 * Math.sin(a))
        .attr('stroke', LINE);
    }

    instrument.append('circle')
      .attr('cx', CX).attr('cy', CY).attr('r', OUTER_RING)
      .attr('fill', 'none')
      .attr('stroke', LINE)
      .attr('stroke-width', 1.2);

    // ── Centre year — set huge in the display face ───────────────────────────
    instrument.append('text')
      .attr('x', CX).attr('y', CY + 4)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('class', 'astro-year')
      .attr('fill', TEXT)
      .attr('font-size', YEAR_FONT)
      .text(String(year));

    // ── Event nodes on staggered orbits ──────────────────────────────────────
    const n = events.length || 1;

    const nodeData: NodeDatum[] = events.map((event, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);
      // Cycle through shells by index so angular neighbours sit at different
      // radii — neighbouring labels then fall at different distances.
      const radius = SHELLS[i % SHELLS.length];
      const right  = cos >= -0.01;
      return {
        event,
        finalX:      CX + radius * cos,
        finalY:      CY + radius * sin,
        color:       categoryColor(event.category),
        angle,
        radius,
        anchorRight: right,
        label:       truncate(event.title),
        labelX:      right ? LABEL_PAD : -LABEL_PAD,
        labelY:      0,
        nudged:      false,
        pulsePhase:  0,
        pulsePeriod: 0,
      };
    });

    // Greedy vertical de-collision per hemisphere so no two labels overlap.
    function deCollide(group: NodeDatum[]) {
      group.sort((a, b) => (a.finalY + a.labelY) - (b.finalY + b.labelY));
      let lastY = -Infinity;
      for (const d of group) {
        let worldY = d.finalY + d.labelY;
        if (worldY < lastY + LINE_H) {
          worldY   = lastY + LINE_H;
          d.labelY = worldY - d.finalY;
          d.nudged = true;
        }
        lastY = worldY;
      }
    }
    deCollide(nodeData.filter(d =>  d.anchorRight));
    deCollide(nodeData.filter(d => !d.anchorRight));

    // ── Spokes (hairline, centre → node) ─────────────────────────────────────
    const linkLayer = scene.append('g').attr('class', 'links');
    linkLayer.selectAll<SVGLineElement, NodeDatum>('line')
      .data(nodeData)
      .join('line')
        .attr('x1', CX).attr('y1', CY)
        .attr('x2', d => d.finalX)
        .attr('y2', d => d.finalY)
        .attr('stroke', LINE)
        .attr('stroke-width', 0.6);

    // ── Event node groups ────────────────────────────────────────────────────
    const nodeLayer = scene.append('g').attr('class', 'nodes');

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodeData, d => d.event.id)
      .join('g')
        .attr('class',     'node')
        .attr('transform', d => `translate(${d.finalX},${d.finalY})`)
        .style('cursor',   'pointer');

    nodeGroups.append('circle')
      .attr('r',            NODE_R)
      .attr('fill',         d => d.color)
      .attr('stroke',       BG)
      .attr('stroke-width', 1.5);

    // Faint leader line where de-collision nudged a label off its radius.
    nodeGroups.filter(d => d.nudged).append('line')
      .attr('class', 'label-leader')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', d => d.labelX)
      .attr('y2', d => d.labelY)
      .attr('stroke', LINE)
      .attr('stroke-width', 0.8)
      .attr('pointer-events', 'none');

    // Labels: mono, ink, hemisphere-anchored outward (never the category colour).
    const labels = nodeGroups.append('text')
      .attr('class',             'astro-label')
      .attr('text-anchor',       d => d.anchorRight ? 'start' : 'end')
      .attr('x',                 d => d.labelX)
      .attr('y',                 d => d.labelY)
      .attr('dominant-baseline', 'central')
      .attr('fill',              TEXT)
      .attr('font-size',         LABEL_FONT)
      .style('cursor',           'pointer')
      .text(d => d.label);

    // Full untruncated name on hover (native tooltip).
    labels.append('title').text(d => d.event.title);

    // Transparent, finger-sized hit area over each small node (≈44px). Added
    // last so it's on top and captures taps, while hover/scale still targets the
    // first <circle> (the visible dot).
    nodeGroups.append('circle')
      .attr('class', 'node-hit')
      .attr('r',     22)
      .attr('fill',  'transparent');

    // ── Interactions ─────────────────────────────────────────────────────────
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'graph-tooltip';
    document.body.appendChild(tooltipEl);

    let tapStart: { x: number; y: number; t: number; id: number } | null = null;

    nodeGroups
      .on('pointerenter', function (ev, d) {
        d3.select(this).select('circle')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1.5)');
        tooltipEl.textContent = d.event.title;
        tooltipEl.style.opacity = '1';
        tooltipEl.style.left = `${(ev as PointerEvent).clientX + 14}px`;
        tooltipEl.style.top  = `${(ev as PointerEvent).clientY - 36}px`;
      })
      .on('pointermove', function (ev) {
        tooltipEl.style.left = `${(ev as PointerEvent).clientX + 14}px`;
        tooltipEl.style.top  = `${(ev as PointerEvent).clientY - 36}px`;
      })
      .on('pointerleave', function () {
        d3.select(this).select('circle')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1)');
        tooltipEl.style.opacity = '0';
      })
      // Selection via pointer events so a tap isn't swallowed as a pan: a tap is
      // a pointerdown→up that barely moves and is quick (mouse and touch alike).
      .on('pointerdown', function (ev) {
        const e = ev as PointerEvent;
        tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      })
      .on('pointerup', function (ev, d) {
        const e = ev as PointerEvent;
        if (!tapStart || tapStart.id !== e.pointerId) return;
        const moved   = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
        const elapsed = performance.now() - tapStart.t;
        tapStart = null;
        if (moved < 10 && elapsed < 400) {
          e.stopPropagation(); // a confirmed tap — don't let the zoom layer react
          onSelectRef.current(d.event);
        }
      });

    // ── Gentle entry fade (respects reduced motion) ──────────────────────────
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      [linkLayer, nodeLayer].forEach(layer => {
        layer.attr('opacity', 0)
          .transition().duration(600).ease(d3.easeCubicOut)
          .attr('opacity', 1);
      });
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      tooltipEl.remove();
      svg.on('.zoom', null);
    };
  }, [events, year, isMobile]); // onSelectRef is a ref — always current, no dep needed

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        aria-label={`Astrolabe of historical events for ${year}`}
        role="img"
      />
      <ZoomControls onZoomIn={() => handleZoom(1.3)} onZoomOut={() => handleZoom(0.77)} />
    </>
  );
}
