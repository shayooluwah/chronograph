import { useEffect, useReducer, useRef } from 'react';
import * as d3 from 'd3';
import { hexToRgba } from '../utils/colors';
import type { YearMapProps } from '../types';

// ── Internal D3 datum types ───────────────────────────────────────────────────

const NODE_COLOR    = '#9ab0ff';
const VISITED_COLOR = '#ffd9a0'; // warm gold — marks years already explored

interface YearNode extends d3.SimulationNodeDatum {
  id:          number;  // the year itself
  isNew:       boolean; // appeared this render — gets the grow-out entry animation
  driftPhase:  number;  // initial sine phase offset (radians)
  driftPeriod: number;  // ms per full drift cycle
  driftAmp:    number;  // px of float either side of the simulated position
  renderX?:    number;  // simulated position + drift, written each frame
  renderY?:    number;
}

type YearLink = d3.SimulationLinkDatum<YearNode>;

type StoredPositions = Map<number, { x: number; y: number }>;

// ── Pure D3 helpers (module scope, no React state) ────────────────────────────

/** Coloured glow filters, same recipe as Graph.tsx: one blue for unvisited
 *  nodes, one gold for visited nodes. */
function appendGlowFilters(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
  const defs = svg.append('defs');

  ([['glow-yearmap', NODE_COLOR], ['glow-yearmap-visited', VISITED_COLOR]] as const)
    .forEach(([id, color]) => {
      const f = defs.append('filter')
        .attr('id',     id)
        .attr('x',      '-60%')
        .attr('y',      '-60%')
        .attr('width',  '220%')
        .attr('height', '220%');

      f.append('feGaussianBlur')
        .attr('in',          'SourceAlpha')
        .attr('stdDeviation', 5)
        .attr('result',      'blurred');

      f.append('feFlood')
        .attr('flood-color',   color)
        .attr('flood-opacity', 0.85)
        .attr('result',        'flooded');

      f.append('feComposite')
        .attr('in',       'flooded')
        .attr('in2',      'blurred')
        .attr('operator', 'in')
        .attr('result',   'coloredGlow');

      const merge = f.append('feMerge');
      merge.append('feMergeNode').attr('in', 'coloredGlow');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    });
}

/** Build simulation nodes. Existing nodes resume their last simulated
 *  position; first-render nodes seed on a loose arc so chronological order
 *  reads left-to-right; new nodes spawn at a linked neighbour's position so
 *  the forces visibly push them outward from the node they connect to. */
function buildNodes(
  sortedYears: number[],
  links:       YearMapProps['links'],
  stored:      StoredPositions,
  w: number, h: number, cx: number, cy: number,
): YearNode[] {
  const isFirstRender = stored.size === 0;

  const nodes: YearNode[] = sortedYears.map((year, i) => {
    const t    = sortedYears.length > 1 ? i / (sortedYears.length - 1) : 0.5;
    const prev = stored.get(year);
    return {
      id:          year,
      isNew:       !isFirstRender && !prev,
      x:           prev?.x ?? cx + (t - 0.5) * w * 0.6,
      y:           prev?.y ?? cy + Math.sin(t * Math.PI * 2.5) * h * 0.18,
      driftPhase:  Math.random() * Math.PI * 2,
      driftPeriod: (5 + Math.random() * 3) * 1000, // 5 – 8 s, gentler than node pulse
      driftAmp:    4 + Math.random() * 5,          // 4 – 9 px float
    };
  });

  for (const node of nodes) {
    if (!node.isNew) continue;
    for (const l of links) {
      if (l.source !== node.id && l.target !== node.id) continue;
      const neighbourPos = stored.get(l.source === node.id ? l.target : l.source);
      if (neighbourPos) {
        node.x = neighbourPos.x + (Math.random() - 0.5) * 24;
        node.y = neighbourPos.y + (Math.random() - 0.5) * 24;
        break;
      }
    }
  }

  return nodes;
}

/** Links from props (chronological chain + expansion spokes), dropping any
 *  whose endpoints are not on the map. */
function buildSimLinks(sortedYears: number[], links: YearMapProps['links']): YearLink[] {
  const present  = new Set(sortedYears);
  const simLinks: YearLink[] = [];
  for (const l of links) {
    if (present.has(l.source) && present.has(l.target)) {
      simLinks.push({ source: l.source, target: l.target });
    }
  }
  return simLinks;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function YearMap({ years, links, visitedYears, onYearSelect }: YearMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  /** Last simulated position per year, persisted across D3 re-renders so
   *  existing nodes stay put and only genuinely new nodes animate in.
   *  Lazily initialised so the Map is not rebuilt on every render. */
  const positionsRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  positionsRef.current ??= new Map();

  /** Keep the callback in a ref so the heavyweight D3 effect does NOT need to
   *  re-run every time the parent re-renders with a new arrow-function identity. */
  const onSelectRef = useRef(onYearSelect);
  useEffect(() => { onSelectRef.current = onYearSelect; }, [onYearSelect]);

  /** Same dims-in-a-ref + render-counter pattern as Graph.tsx: ResizeObserver
   *  updates never cause React re-renders, only D3 effect re-runs. */
  const dimsRef = useRef({ w: 0, h: 0 });
  const [renderKey, bumpRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = containerRef.current;
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
  }, []);

  // ── D3 render ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
    const dims  = dimsRef.current;
    if (!svgEl || dims.w === 0 || dims.h === 0) return;

    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const isMobile = w < 768;
    const RX = isMobile ? 34 : 44; // ellipse horizontal radius
    const RY = isMobile ? 19 : 24; // ellipse vertical radius

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    appendGlowFilters(svg);

    // ── Zoom / pan ─────────────────────────────────────────────────────────────

    const scene = svg.append('g').attr('class', 'scene');

    const zoomBehaviour = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        scene.attr('transform', e.transform.toString());
      });

    svg
      .call(zoomBehaviour)
      .on('dblclick.zoom', null);

    // ── Nodes & links ──────────────────────────────────────────────────────────

    const sortedYears   = years.toSorted((a, b) => a - b);
    const stored        = positionsRef.current!; // initialised during render, never null here
    const isFirstRender = stored.size === 0;

    const nodes    = buildNodes(sortedYears, links, stored, w, h, cx, cy);
    const simLinks = buildSimLinks(sortedYears, links);

    const linkSels = scene.append('g').attr('class', 'links')
      .selectAll<SVGLineElement, YearLink>('line')
      .data(simLinks)
      .join('line')
        .attr('stroke',       'rgba(154,176,255,0.22)')
        .attr('stroke-width', 1.2);

    const nodeGroups = scene.append('g').attr('class', 'nodes')
      .selectAll<SVGGElement, YearNode>('g.year-node')
      .data(nodes, d => d.id)
      .join('g')
        .attr('class',  'year-node')
        .style('cursor', 'pointer')
        .attr('opacity', d => (isFirstRender || d.isNew) ? 0 : 1);

    const isVisited = (d: YearNode) => visitedYears.has(d.id);
    const baseFill  = (d: YearNode) =>
      hexToRgba(isVisited(d) ? VISITED_COLOR : NODE_COLOR, isVisited(d) ? 0.22 : 0.16);

    // Visited marker: a soft outer ring drawn behind the main ellipse
    nodeGroups.filter(isVisited).append('ellipse')
      .attr('class',        'visited-ring')
      .attr('rx',           RX + 7)
      .attr('ry',           RY + 7)
      .attr('fill',         'none')
      .attr('stroke',       hexToRgba(VISITED_COLOR, 0.55))
      .attr('stroke-width', 1.5)
      .attr('filter',       'url(#glow-yearmap-visited)');

    nodeGroups.append('ellipse')
      .attr('class',        'node-body')
      .attr('rx',           RX)
      .attr('ry',           RY)
      .attr('fill',         baseFill)
      .attr('stroke',       d => hexToRgba(isVisited(d) ? VISITED_COLOR : NODE_COLOR, 0.8))
      .attr('stroke-width', 1.5)
      .attr('filter',       d => isVisited(d) ? 'url(#glow-yearmap-visited)' : 'url(#glow-yearmap)');

    nodeGroups.append('text')
      .attr('text-anchor',       'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill',              '#ffffff')
      .attr('font-weight',       600)
      .attr('font-size',         isMobile ? '12px' : '14px')
      .attr('font-family',       'system-ui, sans-serif')
      .attr('letter-spacing',    '0.5')
      .attr('pointer-events',    'none')
      .text(d => String(d.id));

    // Entry animation: first render staggers everything in; afterwards only
    // new nodes appear, growing out of their spawn point as the forces push them.
    nodeGroups.filter(d => isFirstRender || d.isNew)
      .transition().duration(500).delay((_, i) => i * 60).ease(d3.easeCubicOut)
      .attr('opacity', 1);

    nodeGroups.filter(d => d.isNew).select('ellipse.node-body')
      .attr('transform', 'scale(0.2)')
      .transition().duration(550).ease(d3.easeBackOut)
      .attr('transform', 'scale(1)');

    // ── Force simulation ───────────────────────────────────────────────────────

    const simulation = d3.forceSimulation<YearNode>(nodes)
      .force('link', d3.forceLink<YearNode, YearLink>(simLinks)
        .id(d => d.id)
        .distance(isMobile ? 110 : 170)
        .strength(0.4))
      .force('charge',  d3.forceManyBody().strength(isMobile ? -240 : -420))
      .force('center',  d3.forceCenter(cx, cy))
      .force('collide', d3.forceCollide(RX + 14));

    // Re-renders restart with reduced energy so settled nodes barely shift
    // while newcomers still get pushed out to a free spot.
    if (!isFirstRender) simulation.alpha(0.45);

    // ── Interactions ───────────────────────────────────────────────────────────

    // Set while the zoom-into-node exit animation plays; blocks hover/clicks.
    let zooming = false;
    let restoreTimeout: number | undefined;

    nodeGroups
      .on('pointerenter', function (_, d) {
        if (zooming) return;
        d3.select(this).select('ellipse.node-body')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1.15)')
          .attr('fill', hexToRgba(isVisited(d) ? VISITED_COLOR : NODE_COLOR, 0.34));
      })
      .on('pointerleave', function (_, d) {
        if (zooming) return;
        d3.select(this).select('ellipse.node-body')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1)')
          .attr('fill', baseFill(d));
      })
      .on('click', function (ev, d) {
        (ev as MouseEvent).stopPropagation();
        if (zooming) return;
        zooming = true;

        // Zoom-into-node exit: the chosen node swells while everything else
        // fades, then navigation fires and the loading overlay takes over.
        const ZOOM_MS = 450;
        const chosen  = d3.select(this);
        chosen.raise();

        nodeGroups.filter(nd => nd.id !== d.id)
          .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
          .attr('opacity', 0);
        linkSels
          .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
          .attr('opacity', 0);

        chosen.select('ellipse.node-body')
          .interrupt()
          .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
          .attr('transform', 'scale(3)');
        chosen
          .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
          .attr('opacity', 0)
          .on('end', () => {
            onSelectRef.current(d.id);
            // If navigation succeeds the map unmounts and this never shows.
            // If the fetch fails the view stays on the map, so bring it back.
            restoreTimeout = window.setTimeout(() => {
              zooming = false;
              nodeGroups.transition().duration(400).attr('opacity', 1);
              linkSels.transition().duration(400).attr('opacity', 1);
              chosen.select('ellipse.node-body')
                .transition().duration(400)
                .attr('transform', 'scale(1)');
            }, 1200);
          });
      });

    // ── Render loop: simulation position + sine-wave drift ─────────────────────
    // One d3.timer owns all transforms (same pattern as Graph.tsx's pulse);
    // the simulation only updates d.x / d.y, the timer composes the drift on top.

    const driftTimer = d3.timer((elapsed: number) => {
      nodeGroups.attr('transform', d => {
        const t  = (elapsed / d.driftPeriod) * Math.PI * 2;
        const dx = d.driftAmp * Math.sin(d.driftPhase + t);
        const dy = d.driftAmp * Math.cos(d.driftPhase * 1.7 + t * 1.23);
        d.renderX = (d.x ?? cx) + dx;
        d.renderY = (d.y ?? cy) + dy;
        // Persist the simulated (un-drifted) position for the next render
        stored.set(d.id, { x: d.x ?? cx, y: d.y ?? cy });
        return `translate(${d.renderX.toFixed(2)},${d.renderY.toFixed(2)})`;
      });

      linkSels
        .attr('x1', d => (d.source as YearNode).renderX ?? cx)
        .attr('y1', d => (d.source as YearNode).renderY ?? cy)
        .attr('x2', d => (d.target as YearNode).renderX ?? cx)
        .attr('y2', d => (d.target as YearNode).renderY ?? cy);
    });

    // ── Cleanup ────────────────────────────────────────────────────────────────

    return () => {
      clearTimeout(restoreTimeout);
      driftTimer.stop();
      simulation.stop();
      svg.on('.zoom', null);
    };

  }, [years, links, visitedYears, renderKey]); // onSelectRef intentionally omitted — always current

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="year-map-container">
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label="Map of explorable years — select a year to view its events"
        role="img"
      />
    </div>
  );
}
