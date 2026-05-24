"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export function MapModal({ 
  lat, 
  lng, 
  venueName, 
  onClose, 
  ticketUrl 
}: { 
  lat: number, 
  lng: number, 
  venueName: string, 
  onClose: () => void, 
  ticketUrl: string | null 
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [lng, lat],
      zoom: 14,
    });

    new mapboxgl.Marker({ color: '#3b82f6' })
      .setLngLat([lng, lat])
      .addTo(map.current);

  }, [lat, lng]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative w-full max-w-2xl bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-black/50">
          <h3 className="text-lg font-bold text-white">{venueName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl font-bold px-2">
            ✕
          </button>
        </div>
        
        <div ref={mapContainer} className="w-full h-96 bg-gray-800" />
        
        <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-between items-center">
          <p className="text-sm text-gray-400 font-mono">Location Map</p>
          {ticketUrl && (
            <a 
              href={ticketUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-accent hover:bg-blue-500 text-white px-6 py-2 rounded-full font-bold transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]"
            >
              Get Tickets
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
