import { useEffect, useRef } from 'react';
import { categoryColor } from '../utils/colors';
import type { HistoricalEvent, EventCategory } from '../types';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  birth:        'Birth',
  death:        'Death',
  event:        'Event',
  organization: 'Organization',
  publication:  'Publication',
  war:          'War',
  discovery:    'Discovery',
  other:        'Other',
};

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <line x1="2" y1="2"  x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="2" x2="2"  y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" fill="none" aria-hidden="true"
         style={{ flexShrink: 0, marginTop: '2px' }}>
      <path d="M6.5 0C4.015 0 2 2.015 2 4.5c0 3.375 4.5 8.5 4.5 8.5S11 7.875 11 4.5C11 2.015 8.985 0 6.5 0Z"
            fill="currentColor" opacity="0.7" />
      <circle cx="6.5" cy="4.5" r="1.5" fill="white" opacity="0.9" />
      <line x1="6.5" y1="13" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 1h4v4M12 1 6.5 6.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EventPanelProps {
  event:   HistoricalEvent | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventPanel({ event, onClose }: EventPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open / close the native dialog based on the event prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event !== null) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open)  dialog.close();
    }
  }, [event]);

  /** Intercept the native ESC cancel so our CSS visibility transition plays first. */
  function handleCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    onClose();
  }

  const color    = event ? categoryColor(event.category) : 'var(--text-soft)';
  const catLabel = event ? CATEGORY_LABELS[event.category] : '';

  return (
    <dialog
      ref={dialogRef}
      className="event-panel"
      aria-label={event?.title ?? 'Event detail'}
      onCancel={handleCancel}
    >
      <div className="event-panel-content">

        {/* Close button */}
        <div className="event-panel-close-row">
          <button
            type="button"
            className="event-panel-close-btn"
            onClick={onClose}
            aria-label="Close panel"
          >
            <CloseIcon />
          </button>
        </div>

        {event && (
          <>
            {/* Category badge */}
            <div>
              <span
                className="event-panel-badge"
                style={{ '--badge-color': color } as React.CSSProperties}
              >
                {catLabel}
              </span>
            </div>

            {/* Title */}
            <h2 className="event-panel-title">{event.title}</h2>

            {/* Year / Date */}
            <div className="event-panel-date-row">
              <span className="event-panel-date-chip">
                {event.date ?? event.year}
              </span>
            </div>

            {/* Location */}
            {event.location && (
              <div className="event-panel-location">
                <PinIcon />
                <span style={{ lineHeight: 1.5 }}>{event.location}</span>
              </div>
            )}

            {/* Divider */}
            <div className="event-panel-divider" />

            {/* Description — resolved upstream by the enrichment service
                (Wikidata description → Wikipedia summary fallback). */}
            <p className="event-panel-description">
              {event.description?.trim() || 'No description available'}
            </p>
          </>
        )}
      </div>

      {/* Wikipedia link — pinned to bottom, only when available */}
      {event?.wikipediaUrl && (
        <div className="event-panel-wiki-footer">
          <a
            href={event.wikipediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="event-panel-wiki-link"
          >
            Read more on Wikipedia
            <ExternalLinkIcon />
          </a>
        </div>
      )}
    </dialog>
  );
}
