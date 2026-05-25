import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and, gt, asc } from "drizzle-orm";
import { formatPrice } from "@/lib/utils/formatPrice";
import Link from "next/link";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const [event] = await db.select().from(events).where(eq(events.id, params.id)).limit(1);

  if (!event) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white px-4">
        <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
        <Link href="/feed" className="text-blue-500 hover:underline">Return to Feed</Link>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-black text-white pb-24 w-full max-w-md mx-auto relative">
      {/* Back Button */}
      <Link href="/feed" className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </Link>

      {/* Hero Image */}
      <div className="w-full aspect-square relative bg-zinc-900 border-b border-zinc-800">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
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

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-white">{event.venueName}</h3>
            {event.address && <p className="text-zinc-400 text-sm mt-1">{event.address}</p>}
          </div>
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="bg-zinc-800 hover:bg-zinc-700 p-3 rounded-full transition-colors shrink-0">
             🗺️
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

        {event.description && (
          <div>
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">About</h3>
            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
              {event.description.length > 500 ? event.description.substring(0, 500) + '...' : event.description}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Price</span>
            <span className="text-xl font-bold">{priceTag}</span>
          </div>
          <a 
            href={event.ticketUrl || "#"} 
            target={event.ticketUrl ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold py-4 rounded-xl text-center text-lg transition-colors"
          >
            {event.ticketUrl ? "Get Tickets" : "More Info"}
          </a>
        </div>
      </div>
    </div>
  );
}
