export function EventCardSkeleton() {
  return (
    <div className="flex gap-4 px-4 sm:px-5 py-3.5 animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="w-[3.6rem] shrink-0 flex flex-col gap-1.5">
        <div className="h-7 w-12 bg-ink-raised rounded-sm" />
        <div className="h-3 w-5 bg-ink-raised rounded-sm" />
      </div>
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <div className="h-4 w-11/12 bg-ink-raised rounded-sm" />
        <div className="h-3.5 w-1/2 bg-ink-raised rounded-sm" />
        <div className="h-3 w-1/3 bg-ink-raised rounded-sm" />
      </div>
      <div className="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 shrink-0 rounded-md bg-ink-raised" />
    </div>
  );
}
