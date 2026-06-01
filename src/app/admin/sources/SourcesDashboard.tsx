"use client";

import { useState } from "react";
import { addEventbriteSourceAction } from "./actions";

export default function SourcesDashboard({ initialSources }: { initialSources: any[] }) {
  const [sources, setSources] = useState(initialSources);
  const [isAdding, setIsAdding] = useState(false);
  const [ebType, setEbType] = useState<"organizer_id" | "venue_id" | "url">("url");
  const [ebId, setEbId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ebId.trim()) return;

    setIsSubmitting(true);
    const configData = ebType === "url"
      ? { url: ebId.trim() }
      : ebType === "organizer_id" 
        ? { organizer_id: ebId.trim() } 
        : { venue_id: ebId.trim() };
        
    const res = await addEventbriteSourceAction(configData);
    
    if (res.success) {
      // Reload page to fetch updated list
      window.location.reload();
    } else {
      alert("Error adding source: " + res.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-black text-gray-200 overflow-hidden font-sans">
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Ingestion Sources</h1>
          <span className="text-gray-500 text-sm">{sources.length} total sources</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/events" className="text-zinc-400 hover:text-white text-sm transition-colors">← Back to Map</a>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            + Add Eventbrite Source
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="p-4 bg-gray-800 border-b border-gray-700 shrink-0">
          <form onSubmit={handleAddSubmit} className="flex items-center gap-4">
            <select 
              value={ebType}
              onChange={(e) => setEbType(e.target.value as any)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="url">Eventbrite URL (Organizer or Event)</option>
              <option value="organizer_id">Organizer ID</option>
              <option value="venue_id">Venue ID</option>
            </select>
            <input 
              type="text" 
              placeholder={ebType === "url" ? "e.g. https://www.eventbrite.com/o/... or /e/..." : "e.g. 123456789"} 
              value={ebId}
              onChange={(e) => setEbId(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-2 outline-none focus:border-blue-500 w-96"
              required
            />
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
            >
              {isSubmitting ? "Adding..." : "Save Source"}
            </button>
            <button 
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-gray-400 hover:text-white rounded-md text-sm transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-zinc-950">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="sticky top-0 bg-gray-900 text-xs uppercase text-gray-500 border-b border-gray-800 z-10 font-mono">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Venue</th>
              <th className="px-4 py-3">Config (JSON)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sources.map((src) => {
              let statusColor = "text-gray-400";
              if (src.syncStatus === "active") statusColor = "text-green-400";
              else if (src.syncStatus === "error") statusColor = "text-red-400";
              else if (src.syncStatus === "paused") statusColor = "text-orange-400";

              return (
                <tr key={src.id} className="hover:bg-gray-800 transition-colors group">
                  <td className="px-4 py-3 font-medium text-gray-200">
                    {src.type}
                  </td>
                  <td className="px-4 py-3">
                    {src.venueName || <span className="text-gray-600 italic">No venue link</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {JSON.stringify(src.config)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className={`font-medium ${statusColor}`}>
                        {src.syncStatus ? src.syncStatus.toUpperCase() : "UNKNOWN"}
                      </span>
                      {src.errorMessage && (
                        <span className="text-xs text-red-500/80 mt-1 line-clamp-2 max-w-xs" title={src.errorMessage}>
                          {src.errorMessage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {src.lastSyncedAt ? new Date(src.lastSyncedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    }) : 'Never'}
                  </td>
                </tr>
              );
            })}
            
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                  No ingestion sources found in the database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
