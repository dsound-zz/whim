/**
 * Shared venue matching utilities.
 *
 * Previously duplicated in both deduplicateAtIngestion.ts (ingestion-time)
 * and deduplicateEvents.ts (query-time). Consolidated here for consistency.
 */

import { calculateDistanceMiles } from '@/lib/utils/calculateDistance';

/**
 * Normalizes a string for comparison: lowercase, strip non-alphanumeric, trim.
 */
export function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFKD')            // decompose accents so "Rosalía" folds to "Rosalia"
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Computes Jaccard similarity between two token sets.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
export function jaccardSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersectionSize++;
  }

  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Tokenizes a string for Jaccard comparison: lowercase, split on non-alpha, filter short tokens.
 */
export function tokenize(str: string): Set<string> {
  return new Set(
    str
      .normalize('NFKD')            // fold accents ("Rosalía" → "Rosalia") before tokenizing
      .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1)
  );
}

/**
 * Returns true if two venue names refer to the same venue, using:
 * 1. Normalized substring matching (e.g., "Blue Note" matches "Blue Note Jazz Club")
 * 2. Geographic proximity within 0.1 miles (~160 meters)
 */
export function areVenuesSimilar(
  nameA: string | null,
  latA: number | null,
  lngA: number | null,
  nameB: string | null,
  latB: number | null,
  lngB: number | null
): boolean {
  const normA = normalizeForComparison(nameA);
  const normB = normalizeForComparison(nameB);

  if (normA && normB && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  if (latA != null && lngA != null && latB != null && lngB != null) {
    const distanceMiles = calculateDistanceMiles(latA, lngA, latB, lngB);
    return distanceMiles <= 0.1;
  }

  return false;
}
