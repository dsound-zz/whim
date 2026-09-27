import type { CSSProperties } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { fetchEventsNearLocation } from "@/lib/db/eventService";
import { formatPrice } from "@/lib/utils/formatPrice";
import { formatClockTimeParts, formatWeekday } from "@/lib/utils/formatEventTime";
import { CategoryBullet } from "@/components/ui/CategoryBullet";
import type { FeedEvent } from "@/types";

export const metadata = {
  title: "Whim — what's on in New York tonight",
  description: "Every event happening in New York tonight — concerts, comedy, markets, parties, park programs — from every source, on one board.",
};

const BOARD_ROW_COUNT = 7;

const SOURCE_NAMES = [
  "Ticketmaster",
  "Dice",
  "Eventbrite",
  "Songkick",
  "Resident Advisor",
  "Meetup",
  "NYC Parks",
  "city permits",
];

export default async function HomePage() {
  // "Tonight" changes by the hour, so this page must render per request.
  await connection();

  let boardEvents: FeedEvent[] = [];
  let tonightTotal = 0;
  try {
    const { events, total } = await fetchEventsNearLocation({
      minLat: 40.7128 - 0.15,
      maxLat: 40.7128 + 0.15,
      minLng: -74.006 - 0.15,
      maxLng: -74.006 + 0.15,
      timeframe: "tonight",
      limit: 40,
      offset: 0,
    });
    boardEvents = [...events]
      .sort((first, second) => new Date(first.startAt).getTime() - new Date(second.startAt).getTime())
      .slice(0, BOARD_ROW_COUNT);
    tonightTotal = total;
  } catch (error) {
    // The landing page still works without the live board.
    console.error("Landing page board fetch failed:", error);
  }

  const weekdayLabel = formatWeekday(new Date());

  return (
    <div className="min-h-full bg-ink text-moon pb-[var(--bottom-nav-height)] lg:pb-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-8">

        <section className="pt-10 sm:pt-16 pb-10">
          <p className="lg:hidden type-wordmark text-3xl mb-8">whim</p>
          <p className="text-haze text-base sm:text-lg">{weekdayLabel} in New York</p>
          <h1 className="type-headline text-[clamp(2.6rem,7.5vw,5.75rem)] leading-[1.02] mt-3 max-w-[14ch] text-balance">
            Everything on tonight, on one board.
          </h1>
          <p className="text-haze text-base sm:text-lg leading-relaxed mt-5 max-w-[46ch]">
            Shows, parties, markets, readings and park programs from every listing site in the city, sorted by when they start.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link
              href="/feed"
              className="bg-sodium hover:bg-sodium-deep text-ink font-bold px-6 py-3.5 rounded-md text-base transition-colors"
            >
              See tonight&rsquo;s board
            </Link>
            <Link
              href="/submit"
              className="text-moon font-semibold px-4 py-3.5 rounded-md border border-seam hover:bg-ink-raised transition-colors"
            >
              Add your event
            </Link>
          </div>
        </section>

        {boardEvents.length > 0 && (
          <section aria-labelledby="board-heading" className="pb-16">
            <div className="flex items-baseline justify-between gap-4 border-b border-seam pb-3">
              <h2 id="board-heading" className="type-headline text-xl">Starting next</h2>
              <Link href="/feed" className="text-sm font-semibold text-haze hover:text-moon transition-colors">
                All {tonightTotal} tonight
              </Link>
            </div>

            <ol className="board-settle">
              {boardEvents.map((event, rowIndex) => {
                const { clock, meridiem } = formatClockTimeParts(event.startAt);
                const priceTag = formatPrice(event.isFree ?? false, event.priceMin, event.priceMax, event.ticketUrl);
                const isFreeEvent = !!event.isFree || priceTag === "Free";
                const shouldShowPrice = !isFreeEvent && priceTag !== "—" && priceTag !== "View Tickets";

                return (
                  <li key={event.id} style={{ "--row-index": rowIndex } as CSSProperties} className="border-b border-seam">
                    <Link
                      href={`/feed/${event.id}`}
                      className="group grid grid-cols-[4.25rem_1fr] sm:grid-cols-[6rem_1fr_11rem] items-baseline gap-x-4 py-4 hover:bg-ink-raised/60 transition-colors -mx-3 px-3 rounded-sm"
                    >
                      <span className="flex items-baseline gap-1">
                        <span className="type-clock text-[2.1rem] sm:text-[2.6rem] text-sodium">{clock}</span>
                        <span className="text-xs font-semibold text-haze">{meridiem}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base sm:text-lg font-semibold leading-snug line-clamp-2 group-hover:underline decoration-seam underline-offset-4">
                          {event.title}
                        </span>
                        <span className="block text-sm text-haze mt-0.5 truncate">{event.venueName}</span>
                      </span>
                      <span className="col-start-2 sm:col-start-3 flex items-center gap-3 text-xs font-semibold text-haze mt-1.5 sm:mt-0 sm:justify-end">
                        <CategoryBullet category={event.category} />
                        {isFreeEvent && <span className="text-mint">Free</span>}
                        {shouldShowPrice && <span className="text-moon/80">{priceTag}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="pb-20 grid gap-10 sm:grid-cols-2 border-t border-seam pt-10 sm:border-t-0 sm:pt-0">
          <div>
            <h2 className="type-headline text-xl mb-2">Where the listings come from</h2>
            <p className="text-haze leading-relaxed max-w-[48ch]">
              Whim reads {SOURCE_NAMES.slice(0, -1).join(", ")} and {SOURCE_NAMES[SOURCE_NAMES.length - 1]}, plus venue calendars.
              When the same show is listed twice, you see it once, with every ticket price side by side.
            </p>
          </div>
          <div>
            <h2 className="type-headline text-xl mb-2">Run a venue?</h2>
            <p className="text-haze leading-relaxed max-w-[48ch]">
              Listing is free. Send us your event and it goes on the board once it&rsquo;s reviewed.
            </p>
            <Link href="/submit" className="inline-block mt-3 font-semibold text-sodium hover:text-moon transition-colors">
              Add your event
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
