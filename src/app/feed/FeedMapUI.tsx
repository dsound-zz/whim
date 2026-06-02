"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import FloatingControls from "./components/FloatingControls";
import EventDrawer from "./components/EventDrawer";
import { useFavorites } from "@/lib/hooks/useFavorites";

// Make sure to use the token pattern defined in Admin MapPanel
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x4eXh5eHh4MHp6ejJ4eXh5eHh5eHh5In0.xyz";

type FilterType = "Tonight" | "Next 2 Days" | "This Week";

export default function FeedMapUI({ initialEvents }: { initialEvents: any[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("Tonight");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>(initialEvents);
  
  const { toggleFavorite, isFavorite } = useFavorites();

  // Fetch from API when filter changes
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const timeframeMap: Record<FilterType, string> = {
          "Tonight": "tonight",
          "Next 2 Days": "next_2_days",
          "This Week": "this_week",
        };
        const tf = timeframeMap[activeFilter];
        
        // Using NYC default center as per server-side
        const res = await fetch(`/api/feed/events?lat=40.7128&lng=-74.0060&timeframe=${tf}`);
        if (!res.ok) throw new Error("Failed to fetch events");
        
        const result = await res.json();
        setEvents(result.data || []);
        setSelectedEventId(null); // Clear selection when events change
      } catch (err) {
        console.error("Error fetching filtered events:", err);
      }
    };

    fetchEvents();
  }, [activeFilter]);

  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-74.0060, 40.7128], // NYC
      zoom: 12,
      attributionControl: false,
    });

    const currentMap = map.current;

    currentMap.on("load", () => {
      // Add source
      currentMap.addSource("events", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add unclustered point layer
      currentMap.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": "#3b82f6", // Unified blue marker for consumer feed
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#111827",
        },
      });

      // Click event
      currentMap.on("click", "unclustered-point", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        setSelectedEventId(props.id);
        
        // Fly to clicked marker
        currentMap.flyTo({
          center: feature.geometry.type === 'Point' ? (feature.geometry.coordinates as [number, number]) : [-74.0060, 40.7128],
          zoom: 14,
          speed: 1.2,
          padding: { bottom: 300, top: 0, left: 0, right: 0 } // offset for drawer
        });
      });

      // Pointer cursor
      currentMap.on("mouseenter", "unclustered-point", () => {
        currentMap.getCanvas().style.cursor = "pointer";
      });
      currentMap.on("mouseleave", "unclustered-point", () => {
        currentMap.getCanvas().style.cursor = "";
      });

      // Initial data push
      updateMapData(events);
    });

  }, []);

  // Update map source whenever events changes
  const updateMapData = (data: any[]) => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const source = map.current.getSource("events") as mapboxgl.GeoJSONSource;
    if (source) {
      const features = data
        .filter(e => e.lat !== null && e.lng !== null)
        .map(e => ({
          type: "Feature",
          properties: {
            id: e.id,
            title: e.title,
            venueName: e.venueName,
          },
          geometry: {
            type: "Point",
            coordinates: [e.lng as number, e.lat as number],
          },
        }));
      source.setData({
        type: "FeatureCollection",
        features: features as any,
      });
    }
  };

  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      updateMapData(events);
    } else if (map.current) {
      map.current.once("idle", () => {
        updateMapData(events);
      });
    }
  }, [events]);

  // Handle map clicks outside markers to close drawer
  useEffect(() => {
    if (!map.current) return;
    const clickHandler = (e: mapboxgl.MapMouseEvent) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: ["unclustered-point"]
      });
      if (!features || features.length === 0) {
        setSelectedEventId(null);
      }
    };
    map.current.on("click", clickHandler);
    return () => {
      map.current?.off("click", clickHandler);
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col">
      <FloatingControls 
        activeFilter={activeFilter} 
        setActiveFilter={setActiveFilter} 
      />
      
      {/* Full screen Mapbox canvas */}
      <div ref={mapContainer} className="absolute inset-0 z-0 w-full h-full" />

      {/* Slide-up Drawer */}
      <EventDrawer 
        event={selectedEvent} 
        onClose={() => setSelectedEventId(null)}
        isFavorite={selectedEvent ? isFavorite(selectedEvent.id) : false}
        toggleFavorite={() => selectedEvent && toggleFavorite(selectedEvent.id)}
      />
    </div>
  );
}
