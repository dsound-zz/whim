"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FeedHeader } from "./components/FloatingControls";
import { EventCardList } from "./components/EventCardList";
import EventDrawer from "./components/EventDrawer";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { buildMapboxCategoryColorExpression } from "@/lib/utils/categoryColors";
import type { FeedEvent } from "@/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type TimeFilter = "Tonight" | "Next 2 Days" | "This Week";
type MobileViewMode = "list" | "map";

const TIMEFRAME_PARAM_MAP: Record<TimeFilter, string> = {
  "Tonight":     "tonight",
  "Next 2 Days": "next_2_days",
  "This Week":   "this_week",
};

const PARAM_TO_TIMEFRAME: Record<string, TimeFilter> = {
  "tonight":     "Tonight",
  "next_2_days": "Next 2 Days",
  "this_week":   "This Week",
};

export default function FeedMapUI({ initialEvents }: { initialEvents: FeedEvent[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Filter state lives ONLY in the URL ────────────────────────────────────
  const activeFilter: TimeFilter =
    PARAM_TO_TIMEFRAME[searchParams.get("timeframe") ?? ""] ?? "Tonight";
  const activeCategory: string | null = searchParams.get("category");
  const searchQuery: string = searchParams.get("search") ?? "";
  const currentFeedParams = searchParams.toString();

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const isMapStyleLoaded = useRef(false);
  const pendingMapUpdate = useRef<FeedEvent[] | null>(null);

  // UI-only state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [isLoading, setIsLoading] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>("list");

  const { toggleFavorite, isFavorite } = useFavorites();

  // ── URL mutation helpers ───────────────────────────────────────────────────
  const updateUrlParams = useCallback(
    (updates: Partial<{ timeframe: string; category: string | null; search: string }>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (updates.timeframe !== undefined) params.set("timeframe", updates.timeframe);
      if (updates.category !== undefined) {
        if (updates.category) params.set("category", updates.category);
        else params.delete("category");
      }
      if (updates.search !== undefined) {
        if (updates.search.trim()) params.set("search", updates.search.trim());
        else params.delete("search");
      }
      router.replace(`/feed?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setActiveFilter = useCallback(
    (filter: TimeFilter) => updateUrlParams({ timeframe: TIMEFRAME_PARAM_MAP[filter] }),
    [updateUrlParams]
  );

  const setActiveCategory = useCallback(
    (category: string | null) => updateUrlParams({ category }),
    [updateUrlParams]
  );

  const setSearchQuery = useCallback(
    (search: string) => updateUrlParams({ search }),
    [updateUrlParams]
  );

  // ── Map: pushToMap ────────────────────────────────────────────────────────
  // Single function that writes an events array + optional selectedId to the
  // Mapbox GeoJSON source. If the map isn't ready yet, queues via pendingMapUpdate.
  // This is the ONLY place that calls source.setData — no competing code paths.
  const pushToMap = useCallback((data: FeedEvent[], selectedId: string | null) => {
    if (!map.current) return;

    if (!isMapStyleLoaded.current) {
      pendingMapUpdate.current = data;
      return;
    }

    const source = map.current.getSource("events") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const features = data
      .filter((eventItem) => eventItem.lat !== null && eventItem.lng !== null)
      .map((eventItem) => ({
        type: "Feature" as const,
        properties: {
          id: eventItem.id,
          title: eventItem.title,
          venueName: eventItem.venueName,
          category: eventItem.category,
          isSelected: eventItem.id === selectedId,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [eventItem.lng as number, eventItem.lat as number],
        },
      }));

    source.setData({ type: "FeatureCollection", features });
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async (filter: TimeFilter, category: string | null, search: string) => {
    setIsLoading(true);
    try {
      const tf = TIMEFRAME_PARAM_MAP[filter];
      let url = `/api/feed/events?lat=40.7128&lng=-74.0060&timeframe=${tf}&limit=150`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch events");
      const result = await res.json();
      const fetched: FeedEvent[] = result.data || [];

      setEvents(fetched);
      setSelectedEventId(null);

      // Push to map immediately with the fetched data — no stale refs, no
      // effect chains, no race conditions. This is the authoritative update.
      pushToMap(fetched, null);
    } catch (err) {
      console.error("Error fetching events:", err);
    } finally {
      setIsLoading(false);
    }
  }, [pushToMap]);

  // Re-fetch whenever URL-derived filter state changes
  useEffect(() => {
    fetchEvents(activeFilter, activeCategory, searchQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, activeCategory, searchQuery]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  // When selection changes, re-push current events with the new highlight.
  // Uses functional state access to avoid stale closure on `events`.
  useEffect(() => {
    pushToMap(events, selectedEventId);
  // We intentionally only fire when selectedEventId changes — events changes
  // are handled by the fetchEvents direct call above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  // ── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const currentMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-74.006, 40.7128],
      zoom: 11.5,
      attributionControl: false,
    });
    map.current = currentMap;

    currentMap.on("load", () => {
      isMapStyleLoaded.current = true;

      currentMap.addSource("events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Shadow/glow ring for selected marker
      currentMap.addLayer({
        id: "event-markers-halo",
        type: "circle",
        source: "events",
        filter: ["==", ["get", "isSelected"], true],
        paint: {
          "circle-color": "#3b82f6",
          "circle-radius": 16,
          "circle-opacity": 0.18,
          "circle-blur": 0.6,
        },
      });

      // Main markers — colored by category using shared constant
      currentMap.addLayer({
        id: "event-markers",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": buildMapboxCategoryColorExpression() as mapboxgl.Expression,
          "circle-radius": [
            "case", ["==", ["get", "isSelected"], true], 10, 7
          ],
          "circle-stroke-width": [
            "case", ["==", ["get", "isSelected"], true], 2.5, 1.5
          ],
          "circle-stroke-color": "#0a0a0a",
          "circle-opacity": [
            "case", ["==", ["get", "isSelected"], true], 1, 0.9
          ],
        },
      });

      // Click on marker
      currentMap.on("click", "event-markers", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as any;
        setSelectedEventId(props.id);

        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        currentMap.flyTo({
          center: coords,
          zoom: Math.max(currentMap.getZoom(), 13.5),
          speed: 1.4,
          padding: { bottom: 80, top: 40, left: 0, right: 0 },
        });
      });

      // Click on blank area to deselect
      currentMap.on("click", (e) => {
        const hits = currentMap.queryRenderedFeatures(e.point, { layers: ["event-markers"] });
        if (!hits.length) setSelectedEventId(null);
      });

      // Cursor
      currentMap.on("mouseenter", "event-markers", () => {
        currentMap.getCanvas().style.cursor = "pointer";
      });
      currentMap.on("mouseleave", "event-markers", () => {
        currentMap.getCanvas().style.cursor = "";
      });

      // Drain any update that was queued before map finished loading
      if (pendingMapUpdate.current !== null) {
        pushToMap(pendingMapUpdate.current, null);
        pendingMapUpdate.current = null;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to selected event when selection changes from the card list
  const handleEventHover = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (!id || !map.current) return;
    const event = events.find((e) => e.id === id);
    if (!event?.lat || !event?.lng) return;
    map.current.flyTo({
      center: [event.lng, event.lat],
      zoom: Math.max(map.current.getZoom(), 13),
      speed: 1.6,
      padding: { bottom: 40, top: 40, left: 360, right: 40 },
    });
  }, [events]);

  const handleMobileMarkerSelect = useCallback((id: string) => {
    setSelectedEventId(id);
    setMobileViewMode("map");
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full h-full bg-zinc-950 overflow-hidden">

      {/* ── Left panel: Card list ── */}
      <div
        className={`
          flex flex-col
          w-full lg:w-[420px] xl:w-[460px]
          lg:flex shrink-0
          lg:border-r lg:border-zinc-900
          overflow-hidden
          ${mobileViewMode === "map" ? "hidden" : "flex"}
        `}
      >
        <FeedHeader
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          resultCount={events.length}
          viewMode={mobileViewMode}
          onViewModeToggle={() => setMobileViewMode((v) => v === "list" ? "map" : "list")}
        />

        <div className="flex-1 overflow-y-auto">
          <EventCardList
            events={events}
            isLoading={isLoading}
            selectedEventId={selectedEventId}
            onEventHover={handleEventHover}
            activeTimeFilter={activeFilter}
            feedParams={currentFeedParams}
          />
        </div>
      </div>

      {/* ── Right panel: Mapbox ── */}
      <div
        className={`
          flex-1 relative
          lg:block
          ${mobileViewMode === "list" ? "hidden lg:block" : "block"}
        `}
      >
        {/* Mobile: back-to-list button */}
        <div className="absolute top-4 left-4 z-10 lg:hidden">
          <button
            onClick={() => setMobileViewMode("list")}
            className="flex items-center gap-2 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-white text-xs font-semibold px-3.5 py-2 rounded-full shadow-xl"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </button>
        </div>

        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

        {/* Mobile drawer — only on map view */}
        <div className="lg:hidden">
          <EventDrawer
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
            isFavorite={selectedEvent ? isFavorite(selectedEvent.id) : false}
            toggleFavorite={() => selectedEvent && toggleFavorite(selectedEvent.id)}
          />
        </div>
      </div>
    </div>
  );
}
