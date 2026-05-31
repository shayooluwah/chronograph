import type { EventCategory } from '../types';

/** Full metadata list — source of truth for filter pills and graph colours. */
export const FILTER_CATEGORIES: {
  id:    EventCategory;
  label: string;
  color: string;
}[] = [
  { id: 'birth',        label: 'Births',        color: '#4fc3f7' },
  { id: 'death',        label: 'Deaths',        color: '#ef9a9a' },
  { id: 'event',        label: 'Events',        color: '#fff176' },
  { id: 'organization', label: 'Organizations', color: '#a5d6a7' },
  { id: 'publication',  label: 'Publications',  color: '#ce93d8' },
  { id: 'war',          label: 'Wars',          color: '#ff8a65' },
  { id: 'discovery',    label: 'Discoveries',   color: '#80deea' },
  { id: 'other',        label: 'Other',         color: '#b0bec5' },
];

/** Full set of every category id — pass to useState to start with all active. */
export const ALL_CATEGORIES = new Set<EventCategory>(
  FILTER_CATEGORIES.map(c => c.id),
);

/** Quick-lookup colour map derived from FILTER_CATEGORIES. */
export const CATEGORY_COLORS: Record<EventCategory, string> = Object.fromEntries(
  FILTER_CATEGORIES.map(c => [c.id, c.color]),
) as Record<EventCategory, string>;

/**
 * Orbital radius for each category, expressed as a fraction of half the
 * shorter viewport dimension. Multiplied at render time so the graph scales.
 */
export const CATEGORY_ORBIT: Record<EventCategory, number> = {
  birth:        0.37,
  death:        0.40,
  discovery:    0.44,
  publication:  0.47,
  organization: 0.51,
  other:        0.53,
  event:        0.57,
  war:          0.61,
};
