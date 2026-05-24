"use client";

export default function FilterBar({ 
  searchQuery, 
  setSearchQuery,
  dateFilter,
  setDateFilter
}: { 
  searchQuery: string; 
  setSearchQuery: (s: string) => void;
  dateFilter: 'all' | 'this_week' | 'tonight';
  setDateFilter: (f: 'all' | 'this_week' | 'tonight') => void;
}) {
  return (
    <div className="flex items-center gap-4 bg-zinc-950 p-4 shrink-0 border-b border-gray-800">
      <input 
        type="text" 
        placeholder="Search title or venue..." 
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 w-64 font-mono"
      />
      <select 
        value={dateFilter}
        onChange={(e) => setDateFilter(e.target.value as any)}
        className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono"
      >
        <option value="all">All Events</option>
        <option value="this_week">This Week</option>
        <option value="tonight">Tonight</option>
      </select>
    </div>
  );
}
