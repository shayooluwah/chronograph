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
  pulsePhase:   number;
  pulsePeriod:  number;
}

// ── YearMap component types ───────────────────────────────────────────────────

/** A connection between two year nodes on the map, by year value. */
export interface YearMapLink {
  source: number;
  target: number;
}

export interface YearMapProps {
  years:        number[];
  links:        YearMapLink[];
  /** Years the user has already opened — rendered with a glowing ring. */
  visitedYears: Set<number>;
  onYearSelect: (year: number) => void;
}
