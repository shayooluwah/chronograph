import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { HistoricalEvent, EventCategory } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<EventCategory, string> = {
  birth:        '#4fc3f7',
  death:        '#ef9a9a',
  event:        '#fff176',
  organization: '#a5d6a7',
  publication:  '#ce93d8',
  war:          '#ff8a65',
  discovery:    '#80deea',
  other:        '#b0bec5',
};

/**
 * Each category sits at a distinct orbital radius expressed as a fraction of
 * half the shortest viewport dimension. Multiplied at render time so the
 * layout scales to any container.
 */
const CATEGORY_ORBIT: Record<EventCategory, number> = {
  birth:        0.37,
  death:        0.40,
  discovery:    0.44,
  publication:  0.47,
  organization: 0.51,
  other:        0.53,
  event:        0.57,
  war:          0.61,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a 6-digit hex colour to `rgba(r,g,b,a)`. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphProps {
  events:        HistoricalEvent[];
  year:          number;
  onEventSelect: (event: HistoricalEvent) => void;
}

/** Internal datum attached to every event node. */
interface NodeDatum {
  event:        HistoricalEvent;
  finalX:       number;
  finalY:       number;
  color:        string;
  pulsePhase:   number; // radians, randomised per node so they don't pulse in sync
  pulsePeriod:  number; // ms per full sine cycle, 4–6 s
}

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

  // Container dimensions — drive a re-run of the D3 effect on resize
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── D3 render ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
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
    (Object.entries(CATEGORY_COLORS) as [EventCategory, string][]).forEach(([cat, color]) => {
      const f = defs.append('filter')
        .attr('id',     `glow-${cat}`)
        .attr('x',      '-60%')
        .attr('y',      '-60%')
        .attr('width',  '220%')
        .attr('height', '220%');

      // Blur the alpha shape of the source element
      f.append('feGaussianBlur')
        .attr('in',          'SourceAlpha')
        .attr('stdDeviation', 4)
        .attr('result',      'blurred');

      // Flood the blur with the category colour
      f.append('feFlood')
        .attr('flood-color',   color)
        .attr('flood-opacity', 0.9)
        .attr('result',        'flooded');

      // Mask the flood to the blurred shape
      f.append('feComposite')
        .attr('in',       'flooded')
        .attr('in2',      'blurred')
        .attr('operator', 'in')
        .attr('result',   'coloredGlow');

      // Stack glow behind the original graphic
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
      .on('dblclick.zoom', null); // keep double-click for users, disable zoom hijack

    // ── Compute final node positions ──────────────────────────────────────────

    const n         = events.length;
    const halfMin   = Math.min(w, h) / 2;

    const nodeData: NodeDatum[] = events.map((event, i) => {
      // Evenly space angles; start from the top (−π/2) so first node is at 12 o'clock
      const angle = (2 * Math.PI * i) / (n || 1) - Math.PI / 2;
      const r     = (CATEGORY_ORBIT[event.category] ?? 0.5) * halfMin;
      return {
        event,
        finalX:      cx + r * Math.cos(angle),
        finalY:      cy + r * Math.sin(angle),
        color:       CATEGORY_COLORS[event.category],
        pulsePhase:  Math.random() * Math.PI * 2,
        pulsePeriod: (4 + Math.random() * 2) * 1000, // 4–6 s in ms
      };
    });

    // ── Links (spokes from centre to each node) ───────────────────────────────

    const linkLayer = scene.append('g').attr('class', 'links');

    const linkSels = linkLayer
      .selectAll<SVGLineElement, NodeDatum>('line')
      .data(nodeData)
      .join('line')
        .attr('x1', cx).attr('y1', cy)
        .attr('x2', cx).attr('y2', cy) // start collapsed at centre
        .attr('stroke',       'rgba(255,255,255,0.08)')
        .attr('stroke-width',  1);

    // ── Event node groups ─────────────────────────────────────────────────────

    const nodeLayer = scene.append('g').attr('class', 'nodes');

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodeData, d => d.event.id)
      .join('g')
        .attr('class',     'node')
        .attr('transform', `translate(${cx},${cy})`) // start at centre for burst
        .style('cursor',   'pointer');

    nodeGroups.append('circle')
      .attr('r',            NODE_R)
      .attr('fill',         d => hexToRgba(d.color, 0.7))
      .attr('stroke',       d => d.color)
      .attr('stroke-width', 1.5)
      .attr('filter',       d => `url(#glow-${d.event.category})`);

    // ── Central node (rendered above spokes & event nodes) ────────────────────

    const centralGroup = scene.append('g')
      .attr('class',     'central')
      .attr('transform', `translate(${cx},${cy})`);

    // Outer ambient halo (extra-wide, very faint)
    centralGroup.append('circle')
      .attr('r',      CENTRAL_R * 1.7)
      .attr('fill',   'rgba(160,190,255,0.05)')
      .attr('filter', 'url(#glow-central)');

    // Main filled circle
    centralGroup.append('circle')
      .attr('r',      CENTRAL_R)
      .attr('fill',   'url(#grad-central)')
      .attr('filter', 'url(#glow-central)');

    // Year label
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
    Object.assign(tooltipEl.style, {
      position:      'fixed',
      background:    'rgba(8,8,26,0.93)',
      color:         '#dde4ff',
      padding:       '5px 10px',
      borderRadius:  '6px',
      fontSize:      '12px',
      fontFamily:    'system-ui, sans-serif',
      lineHeight:    '1.45',
      pointerEvents: 'none',
      opacity:       '0',
      transition:    'opacity 0.1s',
      zIndex:        '9999',
      maxWidth:      '220px',
      border:        '1px solid rgba(255,255,255,0.14)',
      boxShadow:     '0 4px 16px rgba(0,0,0,0.4)',
      whiteSpace:    'pre-wrap',
    });
    document.body.appendChild(tooltipEl);

    // ── Interactions ──────────────────────────────────────────────────────────

    /** IDs of currently hovered nodes — pulse skips these so hover scale holds. */
    const hoveredIds = new Set<string>();

    nodeGroups
      .on('pointerenter', function (ev, d) {
        hoveredIds.add(d.event.id);

        // Cancel any in-progress pulse transform and scale up smoothly
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

        // Smoothly return to neutral; pulse will take over after the transition
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

    // ── Entry burst (hyperspace effect) ───────────────────────────────────────

    // Both selections share identical duration + easing so they animate in lock-step
    const BURST_MS = 800;

    nodeGroups
      .transition()
      .duration(BURST_MS)
      .ease(d3.easeBackOut)
      .attr('transform', d => `translate(${d.finalX},${d.finalY})`);

    linkSels
      .transition()
      .duration(BURST_MS)
      .ease(d3.easeBackOut)
      .attr('x2', d => d.finalX)
      .attr('y2', d => d.finalY);

    // ── Pulse animation (starts after burst completes) ─────────────────────────

    /**
     * Uses d3.timer which ticks every animation frame.  Each node has a
     * unique phase & period so they pulse independently.
     */
    let pulseTimer: d3.Timer | null = null;

    const pulseStartDelay = setTimeout(() => {
      pulseTimer = d3.timer((elapsed: number) => {
        nodeGroups.each(function (d) {
          // Hands off to hover scale — don't fight it
          if (hoveredIds.has(d.event.id)) return;

          const scale =
            1.0 +
            0.15 * Math.sin(d.pulsePhase + (elapsed / d.pulsePeriod) * Math.PI * 2);

          d3.select(this)
            .select('circle')
            .attr('transform', `scale(${scale.toFixed(5)})`);
        });
      });
    }, BURST_MS + 50); // 50 ms buffer after burst

    // ── Cleanup ───────────────────────────────────────────────────────────────

    return () => {
      clearTimeout(pulseStartDelay);
      pulseTimer?.stop();
      tooltipEl.remove();
      svg.on('.zoom', null);
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, year, dims]); // onSelectRef intentionally omitted — it's always current

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label={`Historical events graph for ${year}`}
        role="img"
      />
    </div>
  );
}
