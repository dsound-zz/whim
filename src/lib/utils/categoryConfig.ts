/**
 * Categories are drawn like subway lines: every category gets one bullet
 * color, all tuned to the same lightness so they read as a set against the
 * ink background and on the dark map. Keep hues clear of sodium amber
 * (#ffb23e), which is reserved for time and selection.
 */
export const CATEGORIES = [
  { id: "music",      label: "Music",        hex: "#8c9bff" },
  { id: "comedy",     label: "Comedy",       hex: "#f4e07a" },
  { id: "art",        label: "Art",          hex: "#ff85b0" },
  { id: "theater",    label: "Theater",      hex: "#ff7373" },
  { id: "food_drink", label: "Food & drink", hex: "#7ee08c" },
  { id: "nightlife",  label: "Nightlife",    hex: "#cf8bff" },
  { id: "sports",     label: "Sports",       hex: "#6cc7ff" },
  { id: "community",  label: "Community",    hex: "#5fe0c9" },
  { id: "fitness",    label: "Fitness",      hex: "#c4e86b" },
  { id: "family",     label: "Family",       hex: "#ffa585" },
  { id: "film",       label: "Film",         hex: "#c9d2e3" },
  { id: "other",      label: "Other",        hex: "#8e89b8" },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

export type CategoryConfig = typeof CATEGORIES[number];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category])
) as Record<string, CategoryConfig>;

/** Returns the category config for a given id, or the "other" fallback. */
export function getCategoryConfig(categoryId: string | null | undefined): CategoryConfig {
  if (!categoryId) return CATEGORY_MAP["other"];
  return CATEGORY_MAP[categoryId] ?? CATEGORY_MAP["other"];
}
