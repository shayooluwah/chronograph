export type EventCategory =
  | 'birth'
  | 'death'
  | 'event'
  | 'organization'
  | 'publication'
  | 'war'
  | 'discovery'
  | 'other';

export interface HistoricalEvent {
  id: string;
  title: string;
  description: string;
  year: number;
  date?: string;
  location?: string;
  category: EventCategory;
  wikidataId: string;
  wikipediaUrl?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  category: EventCategory;
  event: HistoricalEvent;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface YearData {
  year: number;
  events: HistoricalEvent[];
  fetchedAt: number;
}

// ── Graph component types ─────────────────────────────────────────────────────

export interface GraphProps {
  events:        HistoricalEvent[];
  year:          number;
  onEventSelect: (event: HistoricalEvent) => void;
}

/** Internal datum attached to every D3 event node. */
export interface NodeDatum {
  event:        HistoricalEvent;
  finalX:       number;
  finalY:       number;
  color:        string;
  angle:        number;   // radial angle (rad)
  radius:       number;   // distance from centre (px)
  anchorRight:  boolean;  // right hemisphere → label flows rightward
  label:        string;   // truncated display text
  labelX:       number;   // label anchor, local x offset from the node
  labelY:       number;   // label anchor, local y offset (after de-collision)
  nudged:       boolean;  // de-collision moved the label → draw a leader line
  pulsePhase:   number;
  pulsePeriod:  number;
}

// ── YearMap component types ───────────────────────────────────────────────────

export interface YearMapProps {
  /** Years the user has already opened — rendered with a glowing ring. */
  visitedYears: Set<number>;
  /** The most recently visited year; the camera flies to it on return. */
  lastVisitedYear: number | null;
  onYearSelect: (year: number) => void;
}
