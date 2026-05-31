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
