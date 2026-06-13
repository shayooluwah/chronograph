import { FILTER_CATEGORIES } from '../constants/categories';
import { categoryColor } from '../utils/colors';
import type { EventCategory } from '../types';

// Re-export constants from the shared module so callers can use one import.
export { FILTER_CATEGORIES, ALL_CATEGORIES } from '../constants/categories';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CategoryFilterProps {
  active:   Set<EventCategory>;
  onChange: (next: Set<EventCategory>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryFilter({ active, onChange }: CategoryFilterProps) {

  function toggle(id: EventCategory) {
    const next = new Set(active);
    if (next.has(id)) {
      if (next.size <= 1) return; // always keep at least one visible
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set<EventCategory>(FILTER_CATEGORIES.map(c => c.id)));
  }

  const allActive = active.size === FILTER_CATEGORIES.length;

  return (
    /* <fieldset> is the correct semantic wrapper for a group of related controls */
    <fieldset className="chrono-filter-bar">
      <legend className="sr-only">Filter events by category</legend>

      {/* "All" reset pill */}
      <button
        type="button"
        className="filter-pill-all"
        onClick={selectAll}
        aria-pressed={allActive}
        aria-label="Show all categories"
      >
        All
      </button>

      {/* Thin separator */}
      <div className="filter-separator" aria-hidden="true" />

      {/* One pill per category */}
      {FILTER_CATEGORIES.map(({ id, label }) => {
        const on = active.has(id);
        return (
          <button
            key={id}
            type="button"
            className="filter-pill"
            onClick={() => toggle(id)}
            aria-pressed={on}
            aria-label={`${on ? 'Hide' : 'Show'} ${label}`}
            data-active={on ? 'true' : 'false'}
            style={{ '--pill-color': categoryColor(id) } as React.CSSProperties}
          >
            <span className="filter-dot" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </fieldset>
  );
}
