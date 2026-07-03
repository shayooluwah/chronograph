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
  media:        '--c-media',
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
  { id: 'media',        label: 'Media'         },
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
  media:        0.49,
  organization: 0.51,
  other:        0.53,
  event:        0.57,
  war:          0.61,
};

// ── URL routing: category ⇄ slug ───────────────────────────────────────────────
//
// The URL uses the plural, lowercase pill label as a stable slug (e.g. `wars`,
// `births`, `media`), not the internal singular id — so a shared link reads
// naturally. Writing always sorts slugs alphabetically, so the same filter set
// yields the same link regardless of the order pills were toggled.

export const CATEGORY_SLUG: Record<EventCategory, string> = {
  birth:        'births',
  death:        'deaths',
  event:        'events',
  organization: 'organizations',
  publication:  'publications',
  media:        'media',
  war:          'wars',
  discovery:    'discoveries',
  other:        'other',
};

const SLUG_TO_CATEGORY: Record<string, EventCategory> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG).map(([cat, slug]) => [slug, cat as EventCategory]),
) as Record<string, EventCategory>;

/**
 * Parse a URL `:categories` segment into an active-category set. Unknown or
 * malformed slugs are ignored; an absent segment (or one that resolves to
 * nothing usable) falls back to "all categories active".
 */
export function parseCategorySlugs(seg: string | undefined): Set<EventCategory> {
  if (!seg) return new Set(ALL_CATEGORIES);
  const out = new Set<EventCategory>();
  for (const raw of seg.split(',')) {
    const cat = SLUG_TO_CATEGORY[raw.trim().toLowerCase()];
    if (cat) out.add(cat);
  }
  return out.size ? out : new Set(ALL_CATEGORIES);
}

/**
 * The canonical URL segment for a filter set: alphabetically-sorted slugs, or
 * an empty string when every category is active (the default, written as a bare
 * `/:year` with no category segment at all).
 */
export function categorySlugsSegment(active: Set<EventCategory>): string {
  if (active.size >= ALL_CATEGORIES.size) return '';
  return [...active].map(c => CATEGORY_SLUG[c]).sort().join(',');
}
