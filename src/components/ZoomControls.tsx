// ── Props ─────────────────────────────────────────────────────────────────────

interface ZoomControlsProps {
  onZoomIn:  () => void;
  onZoomOut: () => void;
}

/**
 * A small +/− affordance pinned bottom-right, themed with the shared tokens.
 * It sits alongside (never replaces) scroll / pinch zoom — both drive the same
 * d3-zoom behaviour, so its scaleExtent clamping applies to the buttons too.
 */
export default function ZoomControls({ onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" className="zoom-btn" onClick={onZoomIn} aria-label="Zoom in">
        <span aria-hidden="true">+</span>
      </button>
      <button type="button" className="zoom-btn" onClick={onZoomOut} aria-label="Zoom out">
        <span aria-hidden="true">−</span>
      </button>
    </div>
  );
}
