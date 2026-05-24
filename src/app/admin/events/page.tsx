"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchAdminEvents } from "./actions";
import { AdminEvent } from "./types";
import StatsBar from "./StatsBar";
import FilterBar from "./FilterBar";
import EventsTable from "./EventsTable";

const MapPanel = dynamic(() => import("./MapPanel"), { ssr: false });

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<'all' | 'this_week' | 'tonight'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminEvents().then(setEvents);
  }, []);

  const filteredEvents = events.filter((e) => {
    // 1. Date Filter
    if (dateFilter !== 'all') {
      const eventDate = new Date(e.startAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === 'tonight') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (eventDate < today || eventDate >= tomorrow) return false;
      } else if (dateFilter === 'this_week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        if (eventDate < today || eventDate >= nextWeek) return false;
      }
    }

    // 2. Search Filter
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.venueName || "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-screen w-full bg-black text-gray-200 overflow-hidden font-sans">
      <StatsBar events={filteredEvents} />
      <FilterBar 
        searchQuery={searchQuery} 
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter} 
      />
      
      <div className="flex flex-1 overflow-hidden">
        <MapPanel 
          events={filteredEvents} 
          selectedEventId={selectedEventId}
          onMarkerClick={setSelectedEventId} 
        />
        <EventsTable 
          events={filteredEvents} 
          selectedEventId={selectedEventId}
          onRowClick={(e) => setSelectedEventId(prev => prev === e.id ? null : e.id)} 
        />
      </div>

      {/* Global styles for mapbox dark popup overrides */}
      <style dangerouslySetInnerHTML={{__html: `
        .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .mapboxgl-popup-tip {
          border-top-color: #111827 !important;
        }
      `}} />
    </div>
  );
}
