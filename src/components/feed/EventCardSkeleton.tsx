export function EventCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-xl animate-pulse">
      {/* Image Placeholder */}
      <div className="relative w-full aspect-video bg-zinc-900" />

      {/* Content Placeholder */}
      <div className="p-4 flex flex-col gap-2">
        {/* Time / Distance line */}
        <div className="h-3 w-1/3 bg-zinc-800 rounded mt-1" />
        
        {/* Title (2 lines) */}
        <div className="h-5 w-full bg-zinc-800 rounded mt-2" />
        <div className="h-5 w-3/4 bg-zinc-800 rounded" />
        
        {/* Venue */}
        <div className="h-4 w-1/2 bg-zinc-800 rounded mt-2" />
        
        {/* Price */}
        <div className="h-4 w-1/4 bg-zinc-800 rounded mt-3" />
      </div>
    </div>
  );
}
