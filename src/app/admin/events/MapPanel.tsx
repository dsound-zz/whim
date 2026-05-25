"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AdminEvent } from "./types";
import { formatPrice } from "@/lib/utils/formatPrice";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x4eXh5eHh4MHp6ejJ4eXh5eHh5eHh5In0.xyz";

const getSourceColorHex = (source: string) => {
  if (source.includes('ticketmaster')) return '#3b82f6'; 
  if (source.includes('dice')) return '#f97316'; 
  if (source.includes('ra_scrape')) return '#c026d3';
  if (source.includes('eventbrite')) return '#ef4444'; 
  if (source.includes('ical')) return '#22c55e'; 
  return '#6b7280'; 
};

export default function MapPanel({ 
  events,
  selectedEventId,
  onMarkerClick
}: { 
  events: AdminEvent[];
  selectedEventId: string | null;
  onMarkerClick: (id: string | null) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const activePopup = useRef<mapboxgl.Popup | null>(null);

  // Initialize Map Once
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-74.0060, 40.7128], // NYC
      zoom: 11,
    });

    const currentMap = map.current;

    currentMap.on("load", () => {
      currentMap.addSource("events", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      currentMap.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#4b5563",
          "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 25],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1f2937"
        },
      });

      currentMap.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      currentMap.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      currentMap.on("click", "unclustered-point", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        onMarkerClick(props.id === selectedEventId ? null : props.id);
      });

      currentMap.on("mouseenter", "unclustered-point", () => {
        currentMap.getCanvas().style.cursor = "pointer";
      });

      currentMap.on("mouseleave", "unclustered-point", () => {
        currentMap.getCanvas().style.cursor = "";
      });

      // Initial data push if events arrived before load
      updateMapData(events);
    });
  }, []);

  // Helper to push data to map source
  const updateMapData = (data: AdminEvent[]) => {
    if (!map.current) return;
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
            sourceType: e.sourceType,
            color: getSourceColorHex(e.sourceType),
            priceFormatted: formatPrice(e.isFree ?? false, e.priceMin ?? null, e.priceMax ?? null, e.ticketUrl ?? null),
            isFree: e.isFree,
            priceMin: e.priceMin,
            priceMax: e.priceMax,
            ticketUrl: e.ticketUrl,
            startAt: e.startAt
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

  // Sync data whenever events array changes (e.g. from filters)
  useEffect(() => {
    updateMapData(events);
  }, [events]);

  // Handle marker selection / auto-zoom
  useEffect(() => {
    if (!map.current) return;

    if (!selectedEventId) {
      if (activePopup.current) {
        activePopup.current.remove();
        activePopup.current = null;
      }
      // Fly back to overview
      map.current.flyTo({
        center: [-74.0060, 40.7128],
        zoom: 11,
        essential: true,
        speed: 1.2
      });
      return;
    }

    const event = events.find(e => e.id === selectedEventId);
    if (event && event.lat && event.lng) {
      
      // Auto-zoom gently to the selected event
      map.current.flyTo({
        center: [event.lng, event.lat],
        zoom: 13, // Less extreme zoom, allows seeing neighbors
        essential: true,
        speed: 1.2
      });

      if (activePopup.current) {
        activePopup.current.remove();
      }

      const dateStr = new Date(event.startAt).toLocaleString("en-US", {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const priceTag = formatPrice(event.isFree ?? false, event.priceMin ?? null, event.priceMax ?? null, event.ticketUrl ?? null);
      const linkHtml = event.ticketUrl ? `<a href="${event.ticketUrl}" target="_blank" style="color: #3b82f6; text-decoration: underline;">View Tickets</a>` : "";

      activePopup.current = new mapboxgl.Popup({ className: 'dark-popup' })
        .setLngLat([event.lng, event.lat])
        .setHTML(`
          <div style="background: #111827; color: white; padding: 12px; border-radius: 8px; border: 1px solid #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); font-family: monospace;">
            <div style="font-size: 10px; font-weight: bold; padding: 2px 6px; background: ${getSourceColorHex(event.sourceType)}; display: inline-block; border-radius: 4px; margin-bottom: 8px; color: white;">
              ${event.sourceType}
            </div>
            <h3 style="margin: 0 0 4px 0; font-size: 14px; font-family: sans-serif;">${event.title}</h3>
            <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px;">${event.venueName}</p>
            <div style="font-size: 12px; margin-bottom: 4px;">🗓 ${dateStr}</div>
            <div style="font-size: 12px; margin-bottom: 8px;">🎟 ${priceTag}</div>
            ${linkHtml}
          </div>
        `)
        .addTo(map.current);

      activePopup.current.on('close', () => {
         onMarkerClick(null);
      });
    }
  }, [selectedEventId, events, onMarkerClick]);

  return <div ref={mapContainer} className="w-[60%] h-full bg-gray-900 border-t border-gray-800" />;
}
