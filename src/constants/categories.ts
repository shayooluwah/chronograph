import type { EventCategory } from '../types';

/**
 * The single place the category enum is mapped to a colour. Each category
 * points at one of the eight --c-* CSS variables, which carry per-theme values
 * (index.css). `categoryColor()` in utils/colors.ts wraps these in `var(...)`
 * so a colour follows the active theme automatically.
 */
export const CATEGORY_VAR: Record<EventCategory, string> = {
  birth:        '--c-birth',
  death:        '--c-death',
  event:        '--c-event',
  organization: '--c-org',
  publication:  '--c-pub',
  war:          '--c-war',
  discovery:    '--c-disc',
  other:        '--c-other',
};

/** Metadata for the filter pills — labels only; colour comes from categoryColor. */
export const FILTER_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: 'birth',        label: 'Births'        },
  { id: 'death',        label: 'Deaths'        },
  { id: 'event',        label: 'Events'        },
  { id: 'organization', label: 'Organizations' },
  { id: 'publication',  label: 'Publications'  },
  { id: 'war',          label: 'Wars'          },
  { id: 'discovery',    label: 'Discoveries'   },
  { id: 'other',        label: 'Other'         },
];

/** Full set of every category id — pass to useState to start with all active. */
export const ALL_CATEGORIES = new Set<EventCategory>(
  FILTER_CATEGORIES.map(c => c.id),
);

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
