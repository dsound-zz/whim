import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and, gt, asc, gte, lt } from "drizzle-orm";
import { formatPrice } from "@/lib/utils/formatPrice";
import { deduplicateEvents } from "@/lib/utils/deduplicateEvents";
import Link from "next/link";
import { CategoryBullet } from "@/components/ui/CategoryBullet";
import { EventHeroImage } from "./components/EventHeroImage";
import { formatClockTimeParts, formatLongDate, formatShortDate } from "@/lib/utils/formatEventTime";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);

  if (!event) {
    return (
      <div className="min-h-full bg-ink flex flex-col items-start justify-center text-moon px-6 py-24 max-w-md mx-auto">
        <h1 className="type-headline text-3xl mb-2">This event is off the board</h1>
        <p className="text-haze mb-6">It may have been cancelled, or the listing was removed by its source.</p>
        <Link href="/feed" className="bg-sodium hover:bg-sodium-deep text-ink font-bold px-5 py-3 rounded-md transition-colors">See what&rsquo;s on tonight</Link>
      </div>
    );
  }

  // Find other occurrences of the same event on other platforms for comparison
  const startOfDay = new Date(event.startAt);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(event.startAt);
  endOfDay.setHours(23, 59, 59, 999);

  const sameDayEvents = await db.select().from(events).where(
    and(
      eq(events.status, "active"),
      gte(events.startAt, startOfDay),
      lt(events.startAt, endOfDay)
    )
  );

  const groupedEvents = deduplicateEvents(sameDayEvents);
  const matchedGroup = groupedEvents.find(group => 
    group.id === event.id || 
    (group.title.toLowerCase() === event.title.toLowerCase() && group.venueName?.toLowerCase() === event.venueName?.toLowerCase())
  );

  const ticketSources = matchedGroup?.ticketSources || [
    {
      platform: event.platform || "Unknown",
      ticketUrl: event.ticketUrl,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      isFree: event.isFree,
    }
  ];

  const primaryTicketUrl = event.ticketUrl || ticketSources.find(s => s.ticketUrl)?.ticketUrl || "#";

  // Find future occurrences
  let futureDates: any[] = [];
  if (event.title && event.venueName) {
    futureDates = await db.select()
      .from(events)
      .where(
        and(
          eq(events.title, event.title),
          eq(events.venueName, event.venueName),
          gt(events.startAt, new Date()),
          // Don't include the current event itself if it's in the future
          // But technically it's fine to just filter it out in memory
        )
      )
      .orderBy(asc(events.startAt))
      .limit(3);
      
    futureDates = futureDates.filter(e => e.id !== event.id).slice(0, 2);
  }

  const { clock, meridiem } = formatClockTimeParts(event.startAt);
  const longDateLabel = formatLongDate(event.startAt);
  const priceTag = formatPrice(event.isFree ?? false, event.priceMin ?? null, event.priceMax ?? null, event.ticketUrl ?? null);
  const isFreeEvent = !!event.isFree || priceTag === "Free";
  const hasTicketLink = primaryTicketUrl !== "#";

  // Fallback map directions link
  const directionsUrl = `https://maps.apple.com/?q=${encodeURIComponent(event.venueName + " " + (event.address || "New York"))}`;

  // Build the back-to-feed URL, restoring any filter params that were threaded
  // through from the feed card link (e.g. ?timeframe=this_week&category=theater).
  const feedParamKeys = ["timeframe", "category", "search"];
  const feedParamsString = feedParamKeys
    .filter((key) => resolvedSearchParams[key])
    .map((key) => `${key}=${encodeURIComponent(resolvedSearchParams[key]!)}`)
    .join("&");
  const backHref = feedParamsString ? `/feed?${feedParamsString}` : "/feed";

  const descriptionText = event.description ? stripHtmlToPlainText(event.description) : "";

  return (
    <div className="min-h-full bg-ink text-moon">
      <div className="w-full max-w-2xl mx-auto pb-32">
        <div className="px-4 sm:px-6 pt-4 pb-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-haze hover:text-moon transition-colors rounded-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            Back to the board
          </Link>
        </div>

        {event.imageUrl && <EventHeroImage imageUrl={event.imageUrl} title={event.title} />}

        <div className="px-4 sm:px-6 pt-6 flex flex-col gap-8">
          <header>
            <p className="flex items-baseline gap-2">
              <span className="type-clock text-[4.5rem] sm:text-[5.5rem] text-sodium">{clock}</span>
              <span className="type-headline text-2xl text-sodium">{meridiem}</span>
            </p>
            <p className="text-base text-haze mt-2">{longDateLabel}</p>
            <h1 className="type-headline text-[2rem] sm:text-[2.5rem] leading-[1.05] mt-4 text-balance">{event.title}</h1>
            <div className="flex items-center gap-4 mt-3 text-sm font-semibold text-haze">
              <CategoryBullet category={event.category} />
              {isFreeEvent && <span className="text-mint">Free</span>}
            </div>
          </header>

          <section aria-labelledby="venue-heading" className="border-y border-seam py-4 flex justify-between items-center gap-4">
            <div className="min-w-0">
              <h2 id="venue-heading" className="font-semibold text-lg text-moon">{event.venueName}</h2>
              {event.address && <p className="text-haze text-sm mt-0.5">{event.address}</p>}
            </div>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-semibold text-moon border border-seam hover:bg-ink-raised px-3.5 py-2 rounded-md transition-colors"
            >
              Directions
            </a>
          </section>

          {futureDates.length > 0 && (
            <section aria-labelledby="more-dates-heading">
              <h2 id="more-dates-heading" className="type-headline text-lg mb-3">More dates</h2>
              <div className="flex flex-wrap gap-2">
                {futureDates.map((futureDate) => (
                  <Link
                    key={futureDate.id}
                    href={`/feed/${futureDate.id}`}
                    className="border border-seam hover:border-haze px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    {formatShortDate(futureDate.startAt)}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {ticketSources.length > 1 && (
            <section aria-labelledby="compare-heading">
              <h2 id="compare-heading" className="type-headline text-lg mb-1">Compare tickets</h2>
              <p className="text-sm text-haze mb-3">This event is listed on {ticketSources.length} sites.</p>
              <ul className="border-t border-seam">
                {ticketSources.map((source, sourceIndex) => (
                  <li key={sourceIndex} className="border-b border-seam">
                    <a
                      href={source.ticketUrl || "#"}
                      target={source.ticketUrl ? "_blank" : "_self"}
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 py-3.5 hover:bg-ink-raised/60 transition-colors -mx-2 px-2 rounded-sm"
                    >
                      <span className="font-semibold text-moon capitalize">{source.platform}</span>
                      <span className="text-sm text-haze">
                        {formatPrice(source.isFree ?? false, source.priceMin, source.priceMax, source.ticketUrl)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {descriptionText && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="type-headline text-lg mb-2">About this event</h2>
              <div className="text-moon/85 text-[15px] leading-relaxed whitespace-pre-wrap max-w-[65ch]">
                {descriptionText}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-ink/95 backdrop-blur-md border-t border-seam">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-4">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-haze">Price</span>
            <span className={`text-lg font-bold ${isFreeEvent ? "text-mint" : "text-moon"}`}>
              {priceTag === "—" || priceTag === "View Tickets" ? "See site" : priceTag}
            </span>
          </div>
          {hasTicketLink && (
            <a
              href={primaryTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-sodium hover:bg-sodium-deep text-ink font-bold py-3.5 rounded-md text-center text-base transition-colors"
            >
              {isFreeEvent ? "Open event page" : "Get tickets"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function stripHtmlToPlainText(rawHtml: string): string {
  return rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, '\u2019')
    .replace(/&lsquo;/gi, '\u2018')
    .replace(/&rdquo;/gi, '\u201D')
    .replace(/&ldquo;/gi, '\u201C')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
