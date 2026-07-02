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

/** The full "all categories on" set — the default, no-filter state. */
const allCategories = () => new Set<EventCategory>(FILTER_CATEGORIES.map(c => c.id));

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryFilter({ active, onChange }: CategoryFilterProps) {

  const allActive = active.size === FILTER_CATEGORIES.length;

  // Inclusive selection: pills show what's selected, not what's excluded.
  function toggle(id: EventCategory) {
    // From the "all" state a click starts a fresh single-category selection
    // rather than subtracting one from everything.
    if (allActive) {
      onChange(new Set<EventCategory>([id]));
      return;
    }
    const next = new Set(active);
    if (next.has(id)) {
      next.delete(id);
      if (next.size === 0) { onChange(allCategories()); return; } // emptied → back to all
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(allCategories());
  }

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

      {/* One pill per category. In the "all" state no specific filter is applied,
          so category pills read as neutral and "All" is the active indicator;
          once a selection is made, only the selected pills light up. */}
      {FILTER_CATEGORIES.map(({ id, label }) => {
        const on = !allActive && active.has(id);
        return (
          <button
            key={id}
            type="button"
            className="filter-pill"
            onClick={() => toggle(id)}
            aria-pressed={on}
            aria-label={`Show ${label}`}
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
