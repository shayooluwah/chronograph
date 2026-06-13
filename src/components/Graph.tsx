import { useEffect, useReducer, useRef } from 'react';
import * as d3 from 'd3';
import { CATEGORY_COLORS } from '../constants/categories';
import { hexToRgba } from '../utils/colors';
import type { GraphProps, NodeDatum } from '../types';

// ── Component ─────────────────────────────────────────────────────────────────

export default function Graph({ events, year, onEventSelect }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  /**
   * Keep the callback in a ref so the heavyweight D3 effect does NOT need to
   * re-run every time the parent re-renders with a new arrow-function identity.
   */
  const onSelectRef = useRef(onEventSelect);
  useEffect(() => { onSelectRef.current = onEventSelect; }, [onEventSelect]);

  /**
   * Container dimensions are stored in a ref so that ResizeObserver updates
   * do NOT cause unnecessary re-renders.  A separate `renderKey` counter
   * is incremented to trigger the D3 effect only when the size actually changes.
   */
  const dimsRef  = useRef({ w: 0, h: 0 });
  const [renderKey, bumpRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = containerRef.current;
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
  }, []);

  // ── D3 render ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
    const dims  = dimsRef.current;
    if (!svgEl || dims.w === 0 || dims.h === 0) return;

    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const isMobile  = w < 768;
    const NODE_R    = isMobile ?  9 : 12;
    const CENTRAL_R = isMobile ? 28 : 40;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    // ── <defs> ────────────────────────────────────────────────────────────────

    const defs = svg.append('defs');

    // One coloured glow filter per category
    (Object.entries(CATEGORY_COLORS) as [keyof typeof CATEGORY_COLORS, string][]).forEach(([cat, color]) => {
      const f = defs.append('filter')
        .attr('id',     `glow-${cat}`)
        .attr('x',      '-60%')
        .attr('y',      '-60%')
        .attr('width',  '220%')
        .attr('height', '220%');

      f.append('feGaussianBlur')
        .attr('in',          'SourceAlpha')
        .attr('stdDeviation', 4)
        .attr('result',      'blurred');

      f.append('feFlood')
        .attr('flood-color',   color)
        .attr('flood-opacity', 0.9)
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

    // Larger white glow for the central node
    const cf = defs.append('filter')
      .attr('id',     'glow-central')
      .attr('x',      '-120%')
      .attr('y',      '-120%')
      .attr('width',  '340%')
      .attr('height', '340%');

    cf.append('feGaussianBlur')
      .attr('in',          'SourceGraphic')
      .attr('stdDeviation', 10)
      .attr('result',      'blurred');

    const cm = cf.append('feMerge');
    cm.append('feMergeNode').attr('in', 'blurred');
    cm.append('feMergeNode').attr('in', 'SourceGraphic');

    // Drop-shadow for node labels
    const tsf = defs.append('filter')
      .attr('id',     'text-shadow-graph')
      .attr('x',      '-30%')
      .attr('y',      '-30%')
      .attr('width',  '160%')
      .attr('height', '160%');
    tsf.append('feDropShadow')
      .attr('dx',            0)
      .attr('dy',            0)
      .attr('stdDeviation',  2)
      .attr('flood-color',   '#000000')
      .attr('flood-opacity', 0.9);

    // Radial gradient: white core → pale blue/lavender halo
    const rg = defs.append('radialGradient').attr('id', 'grad-central');
    rg.append('stop').attr('offset',  '0%').attr('stop-color', '#ffffff').attr('stop-opacity', 1);
    rg.append('stop').attr('offset', '45%').attr('stop-color', '#ccd8ff').attr('stop-opacity', 0.9);
    rg.append('stop').attr('offset','100%').attr('stop-color', '#9ab0ff').attr('stop-opacity', 0.35);

    // ── Zoom / pan ────────────────────────────────────────────────────────────

    const scene = svg.append('g').attr('class', 'scene');

    const zoomBehaviour = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        scene.attr('transform', e.transform.toString());
      });

    svg
      .call(zoomBehaviour)
      .on('dblclick.zoom', null);

    // ── Layout: nodes on staggered concentric shells ──────────────────────────

    const n      = events.length;
    const minDim = Math.min(w, h);

    // Scale the layout to the open canvas; keep the innermost shell clear of the
    // central year glow (radius ≈ CENTRAL_R * 1.7).
    const SHELLS    = 3;
    const BASE_R    = Math.max(CENTRAL_R * 1.7 + 46, 0.22 * minDim);
    const SHELL_GAP = Math.max(isMobile ? 26 : 34, 0.045 * minDim);
    const LABEL_FONT = isMobile ? 9 : 11;
    const LINE_H     = LABEL_FONT + 2;     // min vertical gap between labels
    const LABEL_PAD  = NODE_R + 8;         // node edge → label start
    const MAX_LABEL  = 22;

    const truncate = (s: string, max: number) =>
      s.length > max ? s.slice(0, max) + '…' : s;

    const nodeData: NodeDatum[] = events.map((event, i) => {
      const angle = (2 * Math.PI * i) / (n || 1) - Math.PI / 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);
      // Cycle through shells by index so angular neighbours sit at different
      // radii; angular order and category colour grouping are unchanged.
      const radius = BASE_R + (i % SHELLS) * SHELL_GAP;
      return {
        event,
        finalX:      cx + radius * cos,
        finalY:      cy + radius * sin,
        color:       CATEGORY_COLORS[event.category],
        angle,
        radius,
        anchorRight: cos >= 0,
        label:       truncate(event.title, MAX_LABEL),
        labelX:      cos * LABEL_PAD,      // push the label outward along its radius
        labelY:      sin * LABEL_PAD,
        nudged:      false,
        pulsePhase:  Math.random() * Math.PI * 2,
        pulsePeriod: (4 + Math.random() * 2) * 1000,
      };
    });

    // Greedy vertical de-collision per hemisphere: sort labels by world y and
    // push any that crowd their predecessor down by a line height, so no two
    // labels overlap. A nudged label gets a faint leader line back to its node.
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

    // ── Links (spokes from centre to each node) ───────────────────────────────

    const linkLayer = scene.append('g').attr('class', 'links');

    const linkSels = linkLayer
      .selectAll<SVGLineElement, NodeDatum>('line')
      .data(nodeData)
      .join('line')
        .attr('x1', cx).attr('y1', cy)
        .attr('x2', cx).attr('y2', cy)
        .attr('stroke',       'rgba(255,255,255,0.08)')
        .attr('stroke-width',  1);

    // ── Event node groups ─────────────────────────────────────────────────────

    const nodeLayer = scene.append('g').attr('class', 'nodes');

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodeData, d => d.event.id)
      .join('g')
        .attr('class',     'node')
        .attr('transform', `translate(${cx},${cy})`)
        .style('cursor',   'pointer');

    nodeGroups.append('circle')
      .attr('r',            NODE_R)
      .attr('fill',         d => hexToRgba(d.color, 0.7))
      .attr('stroke',       d => d.color)
      .attr('stroke-width', 1.5)
      .attr('filter',       d => `url(#glow-${d.event.category})`);

    // Faint leader line, only where de-collision nudged a label off its radius.
    nodeGroups.filter(d => d.nudged).append('line')
      .attr('class',          'label-leader')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', d => d.labelX)
      .attr('y2', d => d.labelY)
      .attr('stroke',         'rgba(255,255,255,0.18)')
      .attr('stroke-width',   1)
      .attr('pointer-events', 'none');

    // Labels anchored outward: right hemisphere flows rightward, left leftward,
    // each vertically centred on its (possibly nudged) anchor point.
    const labels = nodeGroups.append('text')
      .attr('text-anchor',       d => d.anchorRight ? 'start' : 'end')
      .attr('x',                 d => d.labelX)
      .attr('y',                 d => d.labelY)
      .attr('dominant-baseline', 'central')
      .attr('fill',              '#ffffff')
      .attr('font-size',         `${LABEL_FONT}px`)
      .attr('font-family',       'system-ui, sans-serif')
      .attr('filter',            'url(#text-shadow-graph)')
      .style('cursor',           'pointer')
      .text(d => d.label);

    // Full untruncated name on hover (native tooltip), alongside the custom one.
    labels.append('title').text(d => d.event.title);

    // ── Central node ─────────────────────────────────────────────────────────

    const centralGroup = scene.append('g')
      .attr('class',     'central')
      .attr('transform', `translate(${cx},${cy})`);

    centralGroup.append('circle')
      .attr('r',      CENTRAL_R * 1.7)
      .attr('fill',   'rgba(160,190,255,0.05)')
      .attr('filter', 'url(#glow-central)');

    centralGroup.append('circle')
      .attr('r',      CENTRAL_R)
      .attr('fill',   'url(#grad-central)')
      .attr('filter', 'url(#glow-central)');

    centralGroup.append('text')
      .attr('text-anchor',       'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill',              '#ffffff')
      .attr('font-weight',       'bold')
      .attr('font-size',         isMobile ? '13px' : '17px')
      .attr('font-family',       'system-ui, sans-serif')
      .attr('letter-spacing',    '1')
      .attr('pointer-events',    'none')
      .text(String(year));

    // ── Tooltip ───────────────────────────────────────────────────────────────

    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'graph-tooltip'; // styles defined in App.css
    document.body.appendChild(tooltipEl);

    // ── Interactions ──────────────────────────────────────────────────────────

    const hoveredIds = new Set<string>();

    nodeGroups
      .on('pointerenter', function (ev, d) {
        hoveredIds.add(d.event.id);
        d3.select(this).select('circle')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1.4)');
        tooltipEl.textContent = d.event.title;
        tooltipEl.style.opacity = '1';
        tooltipEl.style.left = `${(ev as PointerEvent).clientX + 14}px`;
        tooltipEl.style.top  = `${(ev as PointerEvent).clientY - 36}px`;
      })
      .on('pointermove', function (ev) {
        tooltipEl.style.left = `${(ev as PointerEvent).clientX + 14}px`;
        tooltipEl.style.top  = `${(ev as PointerEvent).clientY - 36}px`;
      })
      .on('pointerleave', function (_, d) {
        hoveredIds.delete(d.event.id);
        d3.select(this).select('circle')
          .interrupt()
          .transition().duration(130).ease(d3.easeCubicOut)
          .attr('transform', 'scale(1)');
        tooltipEl.style.opacity = '0';
      })
      .on('click', function (ev, d) {
        (ev as MouseEvent).stopPropagation();
        onSelectRef.current(d.event);
      });

    // ── Entry burst ───────────────────────────────────────────────────────────

    const BURST_MS = 800;

    nodeGroups
      .transition().duration(BURST_MS).ease(d3.easeBackOut)
      .attr('transform', d => `translate(${d.finalX},${d.finalY})`);

    linkSels
      .transition().duration(BURST_MS).ease(d3.easeBackOut)
      .attr('x2', d => d.finalX)
      .attr('y2', d => d.finalY);

    // ── Pulse animation ───────────────────────────────────────────────────────

    let pulseTimer: d3.Timer | null = null;

    const pulseStartDelay = setTimeout(() => {
      pulseTimer = d3.timer((elapsed: number) => {
        nodeGroups.each(function (d) {
          if (hoveredIds.has(d.event.id)) return;
          const scale = 1.0 + 0.15 * Math.sin(d.pulsePhase + (elapsed / d.pulsePeriod) * Math.PI * 2);
          d3.select(this).select('circle').attr('transform', `scale(${scale.toFixed(5)})`);
        });
      });
    }, BURST_MS + 50);

    // ── Cleanup ───────────────────────────────────────────────────────────────

    return () => {
      clearTimeout(pulseStartDelay);
      pulseTimer?.stop();
      tooltipEl.remove();
      svg.on('.zoom', null);
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, year, renderKey]); // onSelectRef intentionally omitted — always current

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label={`Historical events graph for ${year}`}
        role="img"
      />
    </div>
  );
}
