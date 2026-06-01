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
  const [statusFilter, setStatusFilter] = useState<'active' | 'draft'>('active');
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Derive sorted list of unique source types from the full loaded event list
  const availableSources = Array.from(
    new Set(events.map((e) => e.sourceType))
  ).sort();

  useEffect(() => {
    fetchAdminEvents().then(setEvents);
  }, []);

  const handleApproveEvent = async (eventId: string) => {
    // Optimistically update status to active (removing it from draft view)
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: 'active' } : e))
    );

    // Clear selection if the approved event is currently active selection
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
    }

    try {
      const response = await fetch(`/api/v1/admin/events/${eventId}/publish`, {
        method: 'POST',
        headers: {
          'x-api-key': 'test-key-whim',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to publish event');
      }
    } catch (error) {
      console.error('Error approving event:', error);
      // Revert optimistic update
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, status: 'draft' } : e))
      );
      alert('Failed to approve event. Please check connection and try again.');
    }
  };

  const filteredEvents = events.filter((e) => {
    // 0. Status filter
    if (statusFilter === 'active') {
      if (e.status !== 'active') return false;
    } else if (statusFilter === 'draft') {
      if (e.status !== 'draft' || e.sourceType !== 'direct_submission') return false;
    }

    // 1. Source filter
    if (sourceFilter !== 'all' && e.sourceType !== sourceFilter) return false;

    // 2. Date filter
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

    // 3. Search filter (operates on the debounced committed query)
    if (!searchQuery) return true;
    const lowercaseQuery = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(lowercaseQuery) ||
      (e.venueName || "").toLowerCase().includes(lowercaseQuery)
    );
  });

  return (
    <div className="flex flex-col h-screen w-full bg-black text-gray-200 overflow-hidden font-sans">
      <StatsBar events={filteredEvents} />
      <FilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        availableSources={availableSources}
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
          onApproveEvent={handleApproveEvent}
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
