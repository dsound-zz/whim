export function EventCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 animate-pulse">
      {/* Image placeholder */}
      <div className="w-full aspect-video bg-zinc-900" />

      {/* Content placeholder */}
      <div className="p-4 flex flex-col gap-2">
        {/* Time + badge row */}
        <div className="flex items-center justify-between gap-2">
          <div className="h-3 w-24 bg-zinc-800 rounded-full" />
          <div className="h-4 w-16 bg-zinc-800 rounded-full" />
        </div>

        {/* Title lines */}
        <div className="h-4 w-full bg-zinc-800 rounded mt-1" />
        <div className="h-4 w-3/4 bg-zinc-800 rounded" />

        {/* Venue */}
        <div className="h-3.5 w-1/2 bg-zinc-800 rounded mt-1" />

        {/* Price */}
        <div className="h-3 w-16 bg-zinc-800 rounded mt-0.5" />
      </div>
    </div>
  );
}
