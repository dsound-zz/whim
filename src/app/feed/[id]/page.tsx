import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and, gt, asc, gte, lt } from "drizzle-orm";
import { formatPrice } from "@/lib/utils/formatPrice";
import { deduplicateEvents } from "@/lib/utils/deduplicateEvents";
import Link from "next/link";

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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white px-4">
        <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
        <Link href="/feed" className="text-blue-500 hover:underline">Return to Feed</Link>
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

  const dateObj = new Date(event.startAt);
  const dateStr = dateObj.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' });
  const priceTag = formatPrice(event.isFree ?? false, event.priceMin ?? null, event.priceMax ?? null, event.ticketUrl ?? null);

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

  return (
    <div className="min-h-full bg-black text-white w-full max-w-md mx-auto relative flex flex-col">
      {/* Scrollable content — pb clears the fixed action bar */}
      <div className="flex-1 pb-28">
        {/* Back Button */}
        <div className="sticky top-0 z-10 px-4 pt-4 pb-2 pointer-events-none">
          <Link
            href={backHref}
            className="pointer-events-auto inline-flex bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
        </div>

        {/* Hero Image — blurred backdrop + sharp contained image (Spotify pattern).
            Works at any source resolution — small avatars look intentional, not pixelated. */}
        <div className="w-full aspect-video relative bg-zinc-900 border-b border-zinc-800 -mt-12 overflow-hidden">
          {event.imageUrl ? (
            <>
              {/* Blurred backdrop fill */}
              <img
                src={event.imageUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 saturate-150"
              />
              {/* Dark scrim so text stays readable */}
              <div className="absolute inset-0 bg-black/30" />
              {/* Sharp foreground image — contained at natural aspect ratio */}
              <img
                src={event.imageUrl}
                alt={event.title}
                className="relative z-10 w-full h-full object-contain drop-shadow-2xl"
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-indigo-600 flex items-center justify-center">
              <span className="text-4xl">🎟️</span>
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-black leading-tight mb-2">{event.title}</h1>
            <p className="text-zinc-400 text-lg font-medium">{dateStr} · {timeStr}</p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-white">{event.venueName}</h3>
              {event.address && <p className="text-zinc-400 text-sm mt-1 truncate">{event.address}</p>}
            </div>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-xs font-semibold px-3 py-2 rounded-full transition-colors shrink-0 border border-zinc-700"
            >
              <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Directions
            </a>
          </div>

          {futureDates.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Also Playing</h3>
              <div className="flex flex-wrap gap-2">
                {futureDates.map(fd => (
                  <Link key={fd.id} href={`/feed/${fd.id}`} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 px-3 py-1.5 rounded-full text-sm font-medium transition-colors">
                    {new Date(fd.startAt).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {ticketSources.length > 1 && (
            <div>
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Compare Tickets</h3>
              <div className="flex flex-col gap-2">
                {ticketSources.map((source, idx) => (
                  <a
                    key={idx}
                    href={source.ticketUrl || "#"}
                    target={source.ticketUrl ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-white">{source.platform}</span>
                      <span className="text-xs text-zinc-400">
                        {formatPrice(source.isFree ?? false, source.priceMin, source.priceMax, source.ticketUrl)}
                      </span>
                    </div>
                    <span className="text-xs text-blue-500 font-semibold flex items-center gap-1">
                      Select <span>→</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {event.description && (() => {
            const rawHtml = event.description as string;
            const noTags = rawHtml
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
            return (
              <div>
                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">About</h3>
                <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {noTags}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent">
        <div className="max-w-md mx-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Price</span>
              <span className="text-xl font-bold">{priceTag}</span>
            </div>
            <a
              href={primaryTicketUrl}
              target={primaryTicketUrl !== "#" ? "_blank" : "_self"}
              rel="noopener noreferrer"
              className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold py-4 rounded-xl text-center text-lg transition-colors"
            >
              {primaryTicketUrl !== "#" ? "Get Tickets" : "More Info"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
