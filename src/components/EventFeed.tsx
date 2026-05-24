"use client";

import { useEffect, useState } from "react";
import { EventCard } from "./EventCard";
import { MapModal } from "./MapModal";

type EventType = {
  id: string;
  title: string;
  venueName: string;
  startAt: string;
  imageUrl: string | null;
  priceMin: number | null;
  isFree: boolean;
  lat: number | null;
  lng: number | null;
  ticketUrl: string | null;
};

export function EventFeed() {
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/events?radiusMiles=20");
        const data = await res.json();
        if (data.success) {
          setEvents(data.data);
        } else {
          setError(data.error || "Failed to load events");
        }
      } catch (err) {
        setError("Network error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="glass rounded-2xl h-80 animate-pulse"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass p-6 rounded-2xl text-center text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="glass p-12 rounded-2xl text-center text-slate-400">
        <p className="text-lg">No events found nearby tonight. Maybe stay in?</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {events.map((event) => (
          <div 
            key={event.id} 
            onClick={() => event.lat && event.lng && setSelectedEvent(event)}
            className={event.lat && event.lng ? "cursor-pointer" : ""}
          >
            <EventCard
              title={event.title}
              venueName={event.venueName}
              startAt={event.startAt}
              imageUrl={event.imageUrl}
              priceMin={event.priceMin}
              isFree={event.isFree}
            />
          </div>
        ))}
      </div>
      
      {/* Map Modal */}
      {selectedEvent && selectedEvent.lat && selectedEvent.lng && (
        <MapModal 
          lat={selectedEvent.lat} 
          lng={selectedEvent.lng} 
          venueName={selectedEvent.venueName} 
          ticketUrl={selectedEvent.ticketUrl}
          onClose={() => setSelectedEvent(null)} 
        />
      )}
    </>
  );
}
