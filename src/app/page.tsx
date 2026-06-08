import Link from "next/link";
import { fetchEventsNearLocation } from "@/lib/db/eventService";
import { formatPrice } from "@/lib/utils/formatPrice";
import { getCategoryConfig, getCategoryGradient } from "@/lib/utils/categoryConfig";

export const metadata = {
  title: "Whim — What's happening near me tonight?",
  description: "Discover spontaneous local events in New York City tonight. Music, comedy, art, food, and more — all in one feed.",
};

export default async function HomePage() {
  // Fetch a small batch of featured events for tonight
  let featuredEvents: any[] = [];
  try {
    const { events } = await fetchEventsNearLocation({
      minLat: 40.7128 - 0.15,
      maxLat: 40.7128 + 0.15,
      minLng: -74.006 - 0.15,
      maxLng: -74.006 + 0.15,
      timeframe: "tonight",
      limit: 8,
      offset: 0,
    });
    // Prefer events with images
    const withImages = events.filter((e) => e.imageUrl);
    const withoutImages = events.filter((e) => !e.imageUrl);
    featuredEvents = [...withImages, ...withoutImages].slice(0, 6);
  } catch {
    // Silently fall through — landing page works without events
  }

  return (
    <div className="min-h-full bg-zinc-950 text-white">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-20 pb-16 overflow-hidden">
        {/* Radial glow behind the heading */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%)",
          }}
        />

        {/* City badge */}
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
          <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          New York City
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-none mb-5 max-w-3xl">
          <span className="text-white">What&rsquo;s happening</span>
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            near me tonight?
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-zinc-400 max-w-md mb-10 leading-relaxed">
          Events from every source — music, comedy, art, food, and more — in
          one spontaneous feed.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3.5 rounded-full text-base transition-all shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.45)] hover:-translate-y-0.5"
          >
            Explore Tonight
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>


        {/* Source chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-10">
          {[
            { label: "Ticketmaster", color: "text-blue-400" },
            { label: "Dice", color: "text-orange-400" },
            { label: "Eventbrite", color: "text-red-400" },
            { label: "Songkick", color: "text-pink-400" },
            { label: "NYC Parks", color: "text-green-400" },
            { label: "+ more", color: "text-zinc-500" },
          ].map(({ label, color }) => (
            <span
              key={label}
              className={`text-xs font-semibold ${color} bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full`}
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Tonight's events preview ───────────────────────────────────────── */}
      {featuredEvents.length > 0 && (
        <section className="px-6 pb-16 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-white">
              Tonight in New York
            </h2>
            <Link
              href="/feed"
              className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              See all
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {featuredEvents.map((event) => {
              const cat = getCategoryConfig(event.category);
              const gradient = getCategoryGradient(event.category);
              const timeStr = new Date(event.startAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              const price = formatPrice(event.isFree ?? false, event.priceMin, event.priceMax, event.ticketUrl);

              return (
                <Link
                  key={event.id}
                  href={`/feed/${event.id}`}
                  className="flex flex-col rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-0.5 group"
                >
                  <div className="relative aspect-square overflow-hidden">
                    {event.imageUrl ? (
                      <img
                        src={event.imageUrl}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                      {cat.emoji} {cat.label}
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-zinc-500 mb-0.5">{timeStr}</p>
                    <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug">{event.title}</h3>
                    <p className="text-[10px] text-zinc-500 mt-1 truncate">{event.venueName}</p>
                    {price === "Free" && (
                      <span className="text-[10px] font-bold text-emerald-400 mt-1 block">Free</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Value props ───────────────────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              emoji: "⚡",
              title: "Spontaneous",
              desc: "Built for tonight, not next month. Find something to do in the next few hours.",
            },
            {
              emoji: "🗂",
              title: "Everything",
              desc: "One feed for Ticketmaster, Dice, Eventbrite, NYC Parks, and independent venues.",
            },
            {
              emoji: "🆓",
              title: "Free events",
              desc: "Filter for free events to find gallery openings, park concerts, and community nights.",
            },
          ].map(({ emoji, title, desc }) => (
            <div
              key={title}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
            >
              <div className="text-2xl mb-3">{emoji}</div>
              <h3 className="text-sm font-bold text-white mb-1.5">{title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
