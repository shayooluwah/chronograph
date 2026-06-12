import { useEffect, useReducer, useRef } from 'react';
import * as d3 from 'd3';
import { hexToRgba } from '../utils/colors';
import type { YearMapProps } from '../types';

// ── Internal D3 datum types ───────────────────────────────────────────────────

const NODE_COLOR    = '#9ab0ff';
const VISITED_COLOR = '#ffd9a0'; // warm gold — marks years already explored

/** Hard cap on simulation nodes to keep the force layout cheap. */
const MAX_NODES = 50;

/** The map starts pushing outward on its own once this many years are visited. */
const AUTO_EXPAND_AFTER_VISITS = 5;

/** Offsets for years grown out of a visited node — deliberately not round
 *  numbers so the expansion doesn't feel artificial. */
const EXPANSION_OFFSETS = [-12, 11, 27];

/** Years grown client-side from visited nodes (year → parent year).
 *  Module scope on purpose: YearMap unmounts while a yearDetail is open, so
 *  per-instance state would lose un-clicked expansions on every visit. */
const EXPANDED_YEARS = new Map<number, number>();

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

  const shadow = defs.append('filter')
    .attr('id',     'text-shadow-yearmap')
    .attr('x',      '-20%')
    .attr('y',      '-20%')
    .attr('width',  '140%')
    .attr('height', '140%');

  shadow.append('feDropShadow')
    .attr('dx',            0)
    .attr('dy',            0)
    .attr('stdDeviation',  3)
    .attr('flood-color',   '#000000')
    .attr('flood-opacity', 0.8);
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

/** Merge client-grown years (EXPANDED_YEARS) into the prop data so expansions
 *  survive full D3 rebuilds and YearMap remounts — props only gain a grown
 *  year once the user actually visits it. */
function mergeExpansions(years: number[], links: YearMapProps['links']) {
  const mergedYears = [...years];
  const mergedLinks = [...links];
  const present     = new Set(years);
  for (const [year, parent] of EXPANDED_YEARS) {
    if (!present.has(year) && mergedYears.length < MAX_NODES) {
      present.add(year);
      mergedYears.push(year);
      mergedLinks.push({ source: parent, target: year });
    }
  }
  return { mergedYears, mergedLinks };
}

/** Expansion candidates for a visited year: fixed offsets, skipping year 0
 *  (does not exist) and duplicates, respecting the node cap. */
function pickExpansionYears(visitedYear: number, current: YearNode[]): number[] {
  const existing = new Set<number>();
  for (const n of current) existing.add(n.id);
  const fresh: number[] = [];
  for (const offset of EXPANSION_OFFSETS) {
    const y = visitedYear + offset;
    if (y === 0 || existing.has(y)) continue;
    if (current.length + fresh.length >= MAX_NODES) break;
    fresh.push(y);
  }
  return fresh;
}

/** Fresh simulation datums spawned at (px, py), with a little jitter so
 *  identical start positions don't degenerate the forces. */
function spawnNodesAt(years: number[], px: number, py: number): YearNode[] {
  return years.map(y => ({
    id:          y,
    isNew:       true,
    x:           px + (Math.random() - 0.5) * 8,
    y:           py + (Math.random() - 0.5) * 8,
    driftPhase:  Math.random() * Math.PI * 2,
    driftPeriod: (5 + Math.random() * 3) * 1000,
    driftAmp:    4 + Math.random() * 5,
  }));
}

interface NodeStyle {
  RX:        number;
  RY:        number;
  isMobile:  boolean;
  isVisited: (d: YearNode) => boolean;
  baseFill:  (d: YearNode) => string;
}

/** Appends the ring / body / label structure to entered node groups. */
function decorateNodeEnter(
  enter: d3.Selection<SVGGElement, YearNode, SVGGElement, unknown>,
  { RX, RY, isMobile, isVisited, baseFill }: NodeStyle,
): void {
  // Visited marker: a soft outer ring drawn behind the main ellipse
  enter.filter(isVisited).append('ellipse')
    .attr('class',        'visited-ring')
    .attr('rx',           RX + 7)
    .attr('ry',           RY + 7)
    .attr('fill',         'none')
    .attr('stroke',       hexToRgba(VISITED_COLOR, 0.55))
    .attr('stroke-width', 1.5)
    .attr('filter',       'url(#glow-yearmap-visited)');

  enter.append('ellipse')
    .attr('class',        'node-body')
    .attr('rx',           RX)
    .attr('ry',           RY)
    .attr('fill',         baseFill)
    .attr('stroke',       d => hexToRgba(isVisited(d) ? VISITED_COLOR : NODE_COLOR, 0.8))
    .attr('stroke-width', 1.5)
    .attr('filter',       d => isVisited(d) ? 'url(#glow-yearmap-visited)' : 'url(#glow-yearmap)');

  enter.append('text')
    .attr('text-anchor',       'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill',              '#ffffff')
    .attr('font-weight',       600)
    .attr('font-size',         isMobile ? '12px' : '14px')
    .attr('font-family',       'system-ui, sans-serif')
    .attr('letter-spacing',    '0.5')
    .attr('pointer-events',    'none')
    .attr('filter',            'url(#text-shadow-yearmap)')
    .text(d => String(d.id));
}

/** Stable identity for a link whether its ends are still raw year numbers or
 *  already resolved to node objects by the force simulation. */
const endId   = (end: YearLink['source']): number =>
  (typeof end === 'object' ? end.id : (end as number)); // ids are always year numbers here
const linkKey = (l: YearLink) => `${endId(l.source)}→${endId(l.target)}`;

/** Among unvisited nodes adjacent to a visited one (the exploration
 *  frontier), the oldest by year value; falls back to the oldest unvisited
 *  node anywhere if no frontier exists yet. */
function oldestUnvisitedNeighbour(
  nodes:   YearNode[],
  links:   YearLink[],
  visited: Set<number>,
): number | null {
  const frontier = new Set<number>();
  for (const l of links) {
    const s = endId(l.source);
    const t = endId(l.target);
    if (visited.has(s) && !visited.has(t)) frontier.add(t);
    if (visited.has(t) && !visited.has(s)) frontier.add(s);
  }
  let oldest: number | null = null;
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    if (frontier.size > 0 && !frontier.has(n.id)) continue;
    if (oldest === null || n.id < oldest) oldest = n.id;
  }
  return oldest;
}

/** Fixed placement angles for the three hover ghosts. */
const GHOST_ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

/** Dashed, label-less ghost ellipses hinting at the expansion positions
 *  around a hovered node — only for years not already on the map. */
function showGhostRing(
  layer:   d3.Selection<SVGGElement, unknown, null, undefined>,
  d:       YearNode,
  current: YearNode[],
  RX: number, RY: number, dist: number,
): void {
  const existing = new Set<number>();
  for (const n of current) existing.add(n.id);

  const px = d.renderX ?? d.x ?? 0;
  const py = d.renderY ?? d.y ?? 0;

  layer.selectAll('*').interrupt().remove();
  EXPANSION_OFFSETS.forEach((offset, i) => {
    const y = d.id + offset;
    if (y === 0 || existing.has(y)) return;
    layer.append('ellipse')
      .attr('cx',               px + Math.cos(GHOST_ANGLES[i]) * dist)
      .attr('cy',               py + Math.sin(GHOST_ANGLES[i]) * dist)
      .attr('rx',               RX * 0.75)
      .attr('ry',               RY * 0.75)
      .attr('fill',             'none')
      .attr('stroke',           hexToRgba(NODE_COLOR, 0.4))
      .attr('stroke-width',     1)
      .attr('stroke-dasharray', '4 6')
      .attr('opacity',          0)
      .transition().duration(180)
      .attr('opacity', 0.7);
  });
}

function clearGhostRing(layer: d3.Selection<SVGGElement, unknown, null, undefined>): void {
  layer.selectAll('ellipse')
    .interrupt()
    .transition().duration(120)
    .attr('opacity', 0)
    .remove();
}

/** Expansion entry: scale 0 / opacity 0 → full over 600ms, the same
 *  easeBackOut pop as Graph.tsx's burst entry. */
function animateGrowth(enter: d3.Selection<SVGGElement, YearNode, SVGGElement, unknown>): void {
  enter
    .attr('opacity', 0)
    .transition().duration(600).ease(d3.easeBackOut)
    .attr('opacity', 1);
  enter.select('ellipse.node-body')
    .attr('transform', 'scale(0)')
    .transition().duration(600).ease(d3.easeBackOut)
    .attr('transform', 'scale(1)');
}

interface GhostApi {
  show(d: YearNode): void;
  hide(): void;
}

/** Hover handlers shared by initial and expanded nodes. `isZooming` defers
 *  to the zoom-exit animation, which owns the ellipse while it plays. */
function makeHoverHandlers(style: NodeStyle, isZooming: () => boolean, ghosts: GhostApi) {
  return {
    onPointerEnter(this: SVGGElement, _: unknown, d: YearNode) {
      if (isZooming()) return;
      ghosts.show(d);
      d3.select(this).select('ellipse.node-body')
        .interrupt()
        .transition().duration(130).ease(d3.easeCubicOut)
        .attr('transform', 'scale(1.15)')
        .attr('fill', hexToRgba(style.isVisited(d) ? VISITED_COLOR : NODE_COLOR, 0.34));
    },
    onPointerLeave(this: SVGGElement, _: unknown, d: YearNode) {
      if (isZooming()) return;
      ghosts.hide();
      d3.select(this).select('ellipse.node-body')
        .interrupt()
        .transition().duration(130).ease(d3.easeCubicOut)
        .attr('transform', 'scale(1)')
        .attr('fill', style.baseFill(d));
    },
  };
}

/** Dims-in-a-ref + render-counter pattern (same as Graph.tsx): ResizeObserver
 *  updates never cause React re-renders, only D3 effect re-runs via the key. */
function useContainerDims(ref: React.RefObject<HTMLDivElement | null>) {
  const dimsRef = useRef({ w: 0, h: 0 });
  const [renderKey, bumpRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Eagerly capture initial size so the D3 effect fires on mount
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

export default function YearMap({ years, links, visitedYears, lastVisitedYear, onYearSelect }: YearMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  /** Expansion entry point into the current D3 scene; (re)assigned by the
   *  render effect so it always closes over the live simulation. */
  const expandRef = useRef<((visitedYear: number) => void) | null>(null);

  /** Last simulated position per year, persisted across D3 re-renders so
   *  existing nodes stay put and only genuinely new nodes animate in.
   *  Lazily initialised so the Map is not rebuilt on every render. */
  const positionsRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  positionsRef.current ??= new Map();

  /** Keep the callback in a ref so the heavyweight D3 effect does NOT need to
   *  re-run every time the parent re-renders with a new arrow-function identity. */
  const onSelectRef = useRef(onYearSelect);
  useEffect(() => { onSelectRef.current = onYearSelect; }, [onYearSelect]);

  const { dimsRef, renderKey } = useContainerDims(containerRef);

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

    const { mergedYears, mergedLinks } = mergeExpansions(years, links);

    const sortedYears   = mergedYears.toSorted((a, b) => a - b);
    const stored        = positionsRef.current!; // initialised during render, never null here
    const isFirstRender = stored.size === 0;

    // Mutable graph data: the expansion path appends to these and re-joins,
    // so the simulation keeps running on the same arrays it was given.
    let allNodes = buildNodes(sortedYears, mergedLinks, stored, w, h, cx, cy);
    let allLinks = buildSimLinks(sortedYears, mergedLinks);

    const linkLayer  = scene.append('g').attr('class', 'links');
    const ghostLayer = scene.append('g').attr('class', 'ghosts').attr('pointer-events', 'none');
    const nodeLayer  = scene.append('g').attr('class', 'nodes');

    const isVisited = (d: YearNode) => visitedYears.has(d.id);
    const baseFill  = (d: YearNode) =>
      hexToRgba(isVisited(d) ? VISITED_COLOR : NODE_COLOR, isVisited(d) ? 0.22 : 0.16);
    const nodeStyle: NodeStyle = { RX, RY, isMobile, isVisited, baseFill };

    // Set while the zoom-into-node exit animation plays; blocks hover/clicks.
    let zooming = false;
    let restoreTimeout: number | undefined;

    const ghostApi: GhostApi = {
      show: d => showGhostRing(ghostLayer, d, allNodes, RX, RY, isMobile ? 70 : 100),
      hide: () => clearGhostRing(ghostLayer),
    };
    const { onPointerEnter, onPointerLeave } = makeHoverHandlers(nodeStyle, () => zooming, ghostApi);

    // Reassigned by the join helpers whenever nodes are added, so the event
    // handlers and the drift timer below always operate on the full set.
    let linkSel: d3.Selection<SVGLineElement, YearLink, SVGGElement, unknown>;
    let nodeSel: d3.Selection<SVGGElement, YearNode, SVGGElement, unknown>;

    /** Data-join lines for `allLinks`; returns the enter selection. */
    function joinLinks() {
      const join  = linkLayer.selectAll<SVGLineElement, YearLink>('line').data(allLinks, linkKey);
      const enter = join.enter().append('line')
        .attr('stroke',       'rgba(154,176,255,0.22)')
        .attr('stroke-width', 1.2);
      linkSel = join.merge(enter);
      return enter;
    }

    /** Data-join groups for `allNodes`, decorating and wiring new ones;
     *  returns the enter selection. */
    function joinNodes() {
      const join  = nodeLayer.selectAll<SVGGElement, YearNode>('g.year-node').data(allNodes, d => d.id);
      const enter = join.enter().append('g')
        .attr('class',  'year-node')
        .style('cursor', 'pointer');

      decorateNodeEnter(enter, nodeStyle);

      enter
        .on('pointerenter', onPointerEnter)
        .on('pointerleave', onPointerLeave)
        .on('click',        onNodeClick);

      nodeSel = join.merge(enter);
      return enter;
    }

    joinLinks();
    const enterNodes = joinNodes();

    // Entry animation: first render staggers everything in; afterwards only
    // new nodes appear, growing out of their spawn point as the forces push them.
    enterNodes.attr('opacity', d => (isFirstRender || d.isNew) ? 0 : 1);

    enterNodes.filter(d => isFirstRender || d.isNew)
      .transition().duration(500).delay((_, i) => i * 60).ease(d3.easeCubicOut)
      .attr('opacity', 1);

    enterNodes.filter(d => d.isNew).select('ellipse.node-body')
      .attr('transform', 'scale(0.2)')
      .transition().duration(550).ease(d3.easeBackOut)
      .attr('transform', 'scale(1)');

    // ── Force simulation ───────────────────────────────────────────────────────

    const simulation = d3.forceSimulation<YearNode>(allNodes)
      .force('link', d3.forceLink<YearNode, YearLink>(allLinks)
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

    function onNodeClick(this: SVGGElement, ev: Event, d: YearNode) {
      (ev as MouseEvent).stopPropagation();
      if (zooming) return;
      zooming = true;
      ghostApi.hide(); // pointerleave won't fire once the map fades out

      // Zoom-into-node exit: the chosen node swells while everything else
      // fades, then navigation fires and the loading overlay takes over.
      const ZOOM_MS = 450;
      const chosen  = d3.select(this);
      chosen.raise();

      nodeSel.filter(nd => nd.id !== d.id)
        .transition().duration(ZOOM_MS).ease(d3.easeCubicIn)
        .attr('opacity', 0);
      linkSel
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
            nodeSel.transition().duration(400).attr('opacity', 1);
            linkSel.transition().duration(400).attr('opacity', 1);
            chosen.select('ellipse.node-body')
              .transition().duration(400)
              .attr('transform', 'scale(1)');
          }, 1200);
        });
    }

    // ── Dynamic expansion: grow new years out of a just-visited node ───────────

    function expandFrom(originYear: number) {
      const parent = allNodes.find(n => n.id === originYear);
      if (!parent) return;

      const fresh = pickExpansionYears(originYear, allNodes);
      if (fresh.length === 0) return;

      // Spawn at the origin node's current position so they grow out of it
      const newNodes = spawnNodesAt(fresh, parent.x ?? cx, parent.y ?? cy);

      allNodes = allNodes.concat(newNodes);
      allLinks = allLinks.concat(fresh.map(y => ({ source: originYear, target: y })));
      for (const y of fresh) EXPANDED_YEARS.set(y, originYear);

      joinLinks();
      animateGrowth(joinNodes());

      // Feed the running simulation — no rebuild, just a gentle re-settle
      simulation.nodes(allNodes);
      (simulation.force('link') as d3.ForceLink<YearNode, YearLink>).links(allLinks);
      simulation.alpha(0.3).restart();
    }

    expandRef.current = (visitedYear: number) => {
      expandFrom(visitedYear);
      // Once the user has explored enough, the map pushes outward on its own:
      // also grow from the oldest unexplored frontier node on each return.
      if (visitedYears.size >= AUTO_EXPAND_AFTER_VISITS) {
        const frontier = oldestUnvisitedNeighbour(allNodes, allLinks, visitedYears);
        if (frontier !== null && frontier !== visitedYear) expandFrom(frontier);
      }
    };

    // ── Render loop: simulation position + sine-wave drift ─────────────────────
    // One d3.timer owns all transforms (same pattern as Graph.tsx's pulse);
    // the simulation only updates d.x / d.y, the timer composes the drift on top.

    const driftTimer = d3.timer((elapsed: number) => {
      nodeSel.attr('transform', d => {
        const t  = (elapsed / d.driftPeriod) * Math.PI * 2;
        const dx = d.driftAmp * Math.sin(d.driftPhase + t);
        const dy = d.driftAmp * Math.cos(d.driftPhase * 1.7 + t * 1.23);
        d.renderX = (d.x ?? cx) + dx;
        d.renderY = (d.y ?? cy) + dy;
        // Persist the simulated (un-drifted) position for the next render
        stored.set(d.id, { x: d.x ?? cx, y: d.y ?? cy });
        return `translate(${d.renderX.toFixed(2)},${d.renderY.toFixed(2)})`;
      });

      linkSel
        .attr('x1', d => (d.source as YearNode).renderX ?? cx)
        .attr('y1', d => (d.source as YearNode).renderY ?? cy)
        .attr('x2', d => (d.target as YearNode).renderX ?? cx)
        .attr('y2', d => (d.target as YearNode).renderY ?? cy);
    });

    // ── Cleanup ────────────────────────────────────────────────────────────────

    return () => {
      expandRef.current = null;
      clearTimeout(restoreTimeout);
      driftTimer.stop();
      simulation.stop();
      svg.on('.zoom', null);
    };

    // dimsRef is a stable ref from useContainerDims; onSelectRef is always current
  }, [years, links, visitedYears, renderKey, dimsRef]);

  // ── Expansion trigger ───────────────────────────────────────────────────────
  // Runs when the map mounts after a visit (and whenever a different year is
  // visited). Deferred slightly so the growth animation plays against the
  // final scene — on mount the dims effect bumps renderKey, which rebuilds
  // the D3 scene once more right after the first build.
  useEffect(() => {
    if (lastVisitedYear === null) return;
    const t = window.setTimeout(() => expandRef.current?.(lastVisitedYear), 80);
    return () => clearTimeout(t);
  }, [lastVisitedYear]);

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
