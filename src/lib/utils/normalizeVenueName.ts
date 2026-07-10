/**
 * Canonical venue-name normalization.
 *
 * This is the single normalization used by the venue resolver for both storing
 * `venues.normalized_name` / `venue_aliases.normalized_alias` and for exact-match
 * lookups — the two MUST use the same function or matches silently fail.
 *
 * It fixes the diacritic bug that caused "Rosalía" and "ROSALIA" to never match
 * (NFKD decomposition + combining-mark strip), folds "&"/"and", drops leading
 * articles, and collapses all remaining punctuation/whitespace to single spaces.
 */
export function normalizeVenueName(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .normalize('NFKD') // decompose accented chars: "é" → "e" + combining accent
    .replace(/[̀-ͯ]/g, '') // strip the combining diacritical marks
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ') // any run of non-alphanumerics → single space
    .replace(/\b(the|a|an)\b/g, ' ') // drop articles (venue names rarely hinge on them)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tokenizes a venue name into a set of meaningful tokens (length > 1) using the
 * same normalization as {@link normalizeVenueName}. Used by the resolver's
 * proximity-match step to confirm two nearby coordinates share a distinctive
 * name token (e.g. "elsewhere" in both "Elsewhere" and "Elsewhere - Zone One").
 */
export function tokenizeVenueName(name: string | null | undefined): Set<string> {
  const normalized = normalizeVenueName(name);
  if (!normalized) return new Set();
  return new Set(normalized.split(' ').filter((token) => token.length > 1));
}
