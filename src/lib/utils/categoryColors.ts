/**
 * categoryColors.ts
 *
 * Canonical category → display color mapping used by both the consumer feed
 * map markers and any admin UI that renders category badges.
 * Import from here instead of defining inline Mapbox match expressions.
 */

export interface CategoryMeta {
  /** Hex color used for Mapbox GL circle markers. */
  markerHex: string;
  /** Tailwind text color class for badges and labels. */
  textClass: string;
  /** Tailwind bg color class for badges. */
  bgClass: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  music: {
    markerHex: '#6366f1',
    textClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/20',
  },
  comedy: {
    markerHex: '#f59e0b',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/20',
  },
  art: {
    markerHex: '#f43f5e',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/20',
  },
  theater: {
    markerHex: '#ef4444',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
  },
  food_drink: {
    markerHex: '#10b981',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
  },
  nightlife: {
    markerHex: '#d946ef',
    textClass: 'text-fuchsia-400',
    bgClass: 'bg-fuchsia-500/20',
  },
  sports: {
    markerHex: '#0ea5e9',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/20',
  },
  community: {
    markerHex: '#14b8a6',
    textClass: 'text-teal-400',
    bgClass: 'bg-teal-500/20',
  },
  fitness: {
    markerHex: '#84cc16',
    textClass: 'text-lime-400',
    bgClass: 'bg-lime-500/20',
  },
  family: {
    markerHex: '#f97316',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
  },
  film: {
    markerHex: '#06b6d4',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/20',
  },
};

const DEFAULT_CATEGORY_META: CategoryMeta = {
  markerHex: '#71717a',
  textClass: 'text-zinc-400',
  bgClass: 'bg-zinc-700/30',
};

export function getCategoryMeta(category: string | null | undefined): CategoryMeta {
  if (!category) return DEFAULT_CATEGORY_META;
  return CATEGORY_META[category] ?? DEFAULT_CATEGORY_META;
}

/**
 * Returns the Mapbox GL JS `match` expression array for category-based
 * circle colors. Ready to be passed directly as a paint property value.
 */
export function buildMapboxCategoryColorExpression(): unknown[] {
  const matchEntries: unknown[] = [];
  for (const [category, meta] of Object.entries(CATEGORY_META)) {
    matchEntries.push(category, meta.markerHex);
  }
  return ['match', ['get', 'category'], ...matchEntries, DEFAULT_CATEGORY_META.markerHex];
}
