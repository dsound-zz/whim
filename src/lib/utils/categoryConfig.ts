export const CATEGORIES = [
  { id: "music",      label: "Music",        emoji: "🎵", tailwindColor: "indigo",   hex: "#6366f1" },
  { id: "comedy",     label: "Comedy",       emoji: "🎤", tailwindColor: "amber",    hex: "#f59e0b" },
  { id: "art",        label: "Art",          emoji: "🎨", tailwindColor: "rose",     hex: "#f43f5e" },
  { id: "theater",    label: "Theater",      emoji: "🎭", tailwindColor: "purple",   hex: "#a855f7" },
  { id: "food_drink", label: "Food & Drink", emoji: "🍕", tailwindColor: "emerald",  hex: "#10b981" },
  { id: "nightlife",  label: "Nightlife",    emoji: "🌃", tailwindColor: "fuchsia",  hex: "#d946ef" },
  { id: "sports",     label: "Sports",       emoji: "⚽", tailwindColor: "sky",      hex: "#0ea5e9" },
  { id: "community",  label: "Community",    emoji: "🤝", tailwindColor: "teal",     hex: "#14b8a6" },
  { id: "fitness",    label: "Fitness",      emoji: "🏃", tailwindColor: "lime",     hex: "#84cc16" },
  { id: "family",     label: "Family",       emoji: "👨‍👩‍👧", tailwindColor: "orange",   hex: "#f97316" },
  { id: "film",       label: "Film",         emoji: "🎬", tailwindColor: "cyan",     hex: "#06b6d4" },
  { id: "other",      label: "Other",        emoji: "✨", tailwindColor: "zinc",     hex: "#71717a" },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((cat) => [cat.id, cat])
) as Record<string, typeof CATEGORIES[number]>;

/** Returns the category config for a given id, or the "other" fallback. */
export function getCategoryConfig(categoryId: string | null | undefined) {
  if (!categoryId) return CATEGORY_MAP["other"];
  return CATEGORY_MAP[categoryId] ?? CATEGORY_MAP["other"];
}

/** Returns a Tailwind gradient pair for a category, for image fallback backgrounds. */
export function getCategoryGradient(categoryId: string | null | undefined): string {
  const cat = getCategoryConfig(categoryId);
  const gradients: Record<string, string> = {
    indigo:  "from-indigo-900  to-indigo-700",
    amber:   "from-amber-900   to-amber-700",
    rose:    "from-rose-900    to-rose-700",
    purple:  "from-purple-900  to-purple-700",
    emerald: "from-emerald-900 to-emerald-700",
    fuchsia: "from-fuchsia-900 to-fuchsia-700",
    sky:     "from-sky-900     to-sky-700",
    teal:    "from-teal-900    to-teal-700",
    lime:    "from-lime-900    to-lime-700",
    orange:  "from-orange-900  to-orange-700",
    cyan:    "from-cyan-900    to-cyan-700",
    zinc:    "from-zinc-900    to-zinc-700",
  };
  return gradients[cat.tailwindColor] ?? "from-zinc-900 to-zinc-700";
}

/** Returns pill badge style classes for a category. */
export function getCategoryBadgeClasses(categoryId: string | null | undefined): string {
  const cat = getCategoryConfig(categoryId);
  const styles: Record<string, string> = {
    indigo:  "bg-indigo-500/20  text-indigo-300  border-indigo-500/30",
    amber:   "bg-amber-500/20   text-amber-300   border-amber-500/30",
    rose:    "bg-rose-500/20    text-rose-300    border-rose-500/30",
    purple:  "bg-purple-500/20  text-purple-300  border-purple-500/30",
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    fuchsia: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
    sky:     "bg-sky-500/20     text-sky-300     border-sky-500/30",
    teal:    "bg-teal-500/20    text-teal-300    border-teal-500/30",
    lime:    "bg-lime-500/20    text-lime-300    border-lime-500/30",
    orange:  "bg-orange-500/20  text-orange-300  border-orange-500/30",
    cyan:    "bg-cyan-500/20    text-cyan-300    border-cyan-500/30",
    zinc:    "bg-zinc-500/20    text-zinc-400    border-zinc-500/30",
  };
  return styles[cat.tailwindColor] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
}
