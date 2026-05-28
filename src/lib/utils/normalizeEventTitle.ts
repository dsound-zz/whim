/**
 * Normalizes raw event titles from scraped or API sources into clean,
 * display-ready strings before they are stored in the database.
 *
 * What this does:
 * 1. Strips leading/trailing whitespace
 * 2. Collapses multiple internal spaces
 * 3. Removes decorative emoji (Unicode blocks for emoji, symbols, etc.)
 * 4. Strips excessive punctuation clusters (e.g. "!!!!", "???", "***")
 * 5. Converts to Title Case while preserving all-uppercase acronyms (DJ, NYC, SOLD OUT)
 * 6. Truncates at MAX_TITLE_LENGTH characters at a word boundary
 */

const MAX_TITLE_LENGTH = 120;

// Unicode ranges covering common decorative emoji
// Covers: Emoticons, Misc Symbols, Dingbats, Supplemental Symbols, CJK symbols we don't need
const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA9F}]/gu;

// Preserve these known all-caps tokens as-is
const PRESERVED_UPPERCASE_TOKENS = new Set([
  'DJ', 'NYC', 'NY', 'LA', 'SF', 'UK', 'USA', 'SOLD', 'OUT', 'VIP',
  'LIVE', 'FEAT', 'FT', 'MC', 'EDM', 'R&B', 'B2B', 'EP', 'LP', 'VS',
]);

function toTitleCase(rawTitle: string): string {
  return rawTitle
    .split(' ')
    .map((word) => {
      if (!word) return word;

      // Keep known uppercase acronyms exactly as-is
      if (PRESERVED_UPPERCASE_TOKENS.has(word.toUpperCase())) {
        return word.toUpperCase();
      }

      // If it's already all-uppercase and > 1 char, it might be an acronym — preserve it
      if (word.length > 1 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
        return word;
      }

      // Standard title case: capitalize first letter, lowercase the rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.substring(0, lastSpace).trimEnd() + '…' : truncated + '…';
}

export function normalizeEventTitle(rawTitle: string | null | undefined): string | null {
  if (!rawTitle) return null;

  let normalized = rawTitle
    .replace(EMOJI_REGEX, '')              // strip decorative emoji
    .replace(/[!?*#@]{2,}/g, '')          // strip punctuation clusters (!! ??? ***)
    .replace(/\s+/g, ' ')                 // collapse multiple spaces
    .trim();

  // If after cleaning we have something trivially short, return null so it can be flagged
  if (normalized.length < 3) return null;

  normalized = toTitleCase(normalized);
  normalized = truncateAtWordBoundary(normalized, MAX_TITLE_LENGTH);

  return normalized;
}

/**
 * Returns true if the title is likely just the venue name repeated —
 * a common scraping failure mode.
 */
export function isTitleJustVenueName(title: string, venueName: string | null | undefined): boolean {
  if (!venueName) return false;
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedVenue = venueName.toLowerCase().trim();
  return normalizedTitle === normalizedVenue || normalizedTitle.includes(normalizedVenue);
}
