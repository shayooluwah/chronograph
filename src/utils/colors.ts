import { CATEGORY_VAR } from '../constants/categories';
import type { EventCategory } from '../types';

/**
 * The single helper used everywhere a category is coloured. Returns a CSS
 * `var(--c-*)` reference rather than a resolved value, so a dot or node painted
 * with it follows the active theme automatically (no re-render needed).
 */
export function categoryColor(cat: EventCategory): string {
  return `var(${CATEGORY_VAR[cat]})`;
}
