import { formatPrice } from "@/lib/utils/formatPrice";

type EventCardProps = {
  title: string;
  venueName: string | null;
  startAt: string | Date;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  ticketUrl: string | null;
  distanceMiles: number;
  category: string | null;
};

// Map categories to solid fallback gradients
const getFallbackGradient = (category: string | null) => {
  switch (category) {
    case "music": return "from-indigo-900 to-indigo-600";
    case "comedy": return "from-amber-900 to-amber-600";
    case "art": return "from-rose-900 to-rose-600";
    case "theater": return "from-purple-900 to-purple-600";
    case "food_drink": return "from-emerald-900 to-emerald-600";
    case "nightlife": return "from-fuchsia-900 to-fuchsia-600";
    default: return "from-zinc-900 to-zinc-700";
  }
};

export function EventCard({
  title,
  venueName,
  startAt,
  imageUrl,
  priceMin,
  priceMax,
  isFree,
  ticketUrl,
  distanceMiles,
  category
}: EventCardProps) {
  const dateObj = typeof startAt === 'string' ? new Date(startAt) : startAt;
  
  // Format relative day
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(dateObj);
  eventDay.setHours(0, 0, 0, 0);
  const diffTime = eventDay.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let dayStr = "";
  if (diffDays === 0) dayStr = "Tonight";
  else if (diffDays === 1) dayStr = "Tomorrow";
  else dayStr = dateObj.toLocaleDateString("en-US", { weekday: "short" });

  const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const priceTag = formatPrice(isFree ?? false, priceMin, priceMax, ticketUrl);
  
  // Distance formatting
  const distanceStr = distanceMiles < 999 ? `${distanceMiles.toFixed(1)} mi` : "";

  return (
    <div className="flex flex-col rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-xl active:scale-[0.98] transition-transform">
      {/* Image / Fallback Container */}
      <div className="relative w-full aspect-video">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${getFallbackGradient(category)}`} />
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-1">
        <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
          <span>{dayStr} at {timeStr} {distanceStr && `· ${distanceStr}`}</span>
        </div>
        <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 mt-1">
          {title}
        </h3>
        <p className="text-sm font-medium text-zinc-300 mt-1 truncate">
          {venueName || "Unknown Venue"}
        </p>
        <p className="text-sm font-bold text-zinc-400 mt-2">
          {priceTag}
        </p>
      </div>
    </div>
  );
}
