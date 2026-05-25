"use client";

import { useState, useEffect } from "react";
import { EventCard } from "./EventCard";
import { EventCardSkeleton } from "./EventCardSkeleton";
import { FeedFilters } from "./FeedFilters";
import Link from "next/link";
import { AdminEvent } from "@/app/admin/events/types"; // using for type

type FeedListProps = {
  initialEvents: any[];
};

export function FeedList({ initialEvents }: FeedListProps) {
  const [events, setEvents] = useState<any[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [activeDate, setActiveDate] = useState("tonight");
  
  const [locationState, setLocationState] = useState<"pending" | "granted" | "denied">("pending");
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    // On mount, silently request location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationState("granted");
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setLocationState("denied");
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      setLocationState("denied");
    }
  }, []);

  useEffect(() => {
    // Refetch when date or coords change
    async function fetchEvents() {
      setLoading(true);
      try {
        let url = `/api/feed/events?date=${activeDate}`;
        if (coords) {
          url += `&lat=${coords.lat}&lng=${coords.lng}`;
        }
        
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setEvents(data.data);
        }
      } catch (e) {
        console.error("Failed to fetch events", e);
      } finally {
        setLoading(false);
      }
    }

    // Skip the very first initial render fetch if location hasn't resolved and date is tonight
    if (activeDate === "tonight" && locationState === "pending") {
      return;
    }
    fetchEvents();
  }, [activeDate, coords, locationState]);

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto pt-6 px-4">
      <h1 className="text-3xl font-black text-white mb-6">Whim</h1>
      
      <FeedFilters activeDate={activeDate} setActiveDate={setActiveDate} />

      {locationState === "denied" && (
        <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between mb-4 mt-2">
          <span className="text-xs text-zinc-400">Allow location for distance sorting</span>
          <button 
            onClick={() => {
              alert("Please enable location permissions in your browser settings.");
            }}
            className="text-xs font-semibold text-white bg-zinc-800 px-3 py-1.5 rounded-md"
          >
            Allow
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6 pb-20 pt-2">
        {loading ? (
          <>
            <EventCardSkeleton />
            <EventCardSkeleton />
            <EventCardSkeleton />
          </>
        ) : events.length > 0 ? (
          events.map((evt) => (
            <Link href={`/feed/${evt.id}`} key={evt.id} className="block">
              <EventCard
                title={evt.title}
                venueName={evt.venueName}
                startAt={evt.startAt}
                imageUrl={evt.imageUrl}
                priceMin={evt.priceMin}
                priceMax={evt.priceMax}
                isFree={evt.isFree}
                ticketUrl={evt.ticketUrl}
                distanceMiles={evt.distanceMiles}
                category={evt.category}
              />
            </Link>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">🌙</div>
            <h3 className="text-xl font-bold text-white mb-2">Nothing found nearby</h3>
            <p className="text-sm text-zinc-500">
              {activeDate === "tonight" 
                ? "Try looking at tomorrow or this weekend." 
                : "Try expanding your search or checking back later."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
