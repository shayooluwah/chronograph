/**
 * Text-casing helpers for data-derived strings.
 *
 * Wikidata stores labels and descriptions lowercase-initial by convention
 * ("genetics", "football at the 1900 Summer Olympics", "science of genes…").
 * We want them to read as sentences without disturbing the rest of the string —
 * so this is *not* a CSS text-transform and *not* title-casing.
 */

/**
 * True sentence case: uppercase only the first alphabetic character and leave
 * the entire remainder exactly as-is, preserving internal capitals and proper
 * nouns. Leading non-letters (quotes, digits) are skipped, so `"1900 census"`
 * and `«word»` capitalise the first real letter.
 *
 *   "football at the 1900 Summer Olympics" → "Football at the 1900 Summer Olympics"
 *   "science of genes…"                    → "Science of genes…"
 */
export function sentenceCase(str: string): string {
  if (!str) return str;
  const m = str.match(/\p{L}/u); // first letter (Unicode-aware)
  if (!m || m.index === undefined) return str;
  const i = m.index;
  return str.slice(0, i) + str[i].toLocaleUpperCase() + str.slice(i + 1);
}
