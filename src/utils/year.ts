/**
 * Year display + numbering helpers.
 *
 * The app uses *historical* year numbering everywhere in its own state: there is
 * no year 0, and a negative year `-n` means "n BCE" (so −1 = 1 BCE, −44 = 44 BCE).
 * This is distinct from the *astronomical* numbering Wikidata stores dates in,
 * where 1 BCE = year 0 (the conversion for querying lives in api/year.js).
 */

/**
 * Render a historical year for display: negatives become "44 BC", positives
 * stay as the bare number ("1599"). Never shows "-44" or a spurious year 0.
 */
export function formatYear(year: number): string {
  return year < 0 ? `${-year} BC` : `${year}`;
}

/**
 * Parse a URL `:year` segment into a historical year, or null if invalid.
 *
 * Routing contract: the year segment is the same signed-integer form the search
 * input accepts — a negative number is BC and there is no year 0 (so `/1894` is
 * 1894 AD and `/-44` is 44 BC, which the UI then renders as "44 BC"). This is the
 * app's single year convention; the URL does not introduce a second one.
 */
export function parseYearSlug(seg: string): number | null {
  const t = seg.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n === 0 ? null : n;
}
