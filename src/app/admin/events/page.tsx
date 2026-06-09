"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchAdminEventsAction } from "./actions";
import type { AdminEvent } from "./types";
import type { FetchAdminEventsParams } from "@/lib/db/eventService";
import StatsBar from "./StatsBar";
import FilterBar from "./FilterBar";
import EventsTable from "./EventsTable";

// Tab components — lazy loaded so they don't bloat the initial bundle
const DataQualityTab = dynamic(() => import("./DataQualityTab"), { ssr: false });
const IntegrityTab   = dynamic(() => import("./IntegrityTab"),   { ssr: false });

// Verification data fetchers (needed for IntegrityTab initial load)
import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
  fetchOverviewAction,
} from "@/app/admin/verification/actions";
import type { VerificationLog, VerificationStats } from "@/types/verification";
import type { DataQualityOverview } from "@/types/audit";

// ─── AddEventModal (lazy — only needed when user clicks +) ───────────────────
const AddEventModal = dynamic(() => import("./AddEventModal"), { ssr: false });

type TabId = "events" | "quality" | "integrity";

// ─── Tab definition ───────────────────────────────────────────────────────────

interface Tab {
  id: TabId;
  label: string;
  shortLabel: string;
}

const TABS: Tab[] = [
  { id: "events",    label: "Events",       shortLabel: "Events" },
  { id: "quality",   label: "Data Quality", shortLabel: "Quality" },
  { id: "integrity", label: "Integrity",    shortLabel: "Integrity" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("events");

  // ── Events tab state ──────────────────────────────────────────────────────
  const [events, setEvents]           = useState<AdminEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter]   = useState<"all" | "this_week" | "tonight">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "draft" | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);

  // ── Data Quality tab state ────────────────────────────────────────────────
  const [overview, setOverview] = useState<DataQualityOverview | null>(null);

  // ── Integrity tab state ───────────────────────────────────────────────────
  const [integrityLogs, setIntegrityLogs]   = useState<VerificationLog[]>([]);
  const [integrityStats, setIntegrityStats] = useState<VerificationStats | null>(null);

  // ── Derived filter values ─────────────────────────────────────────────────
  const availableSources = Array.from(new Set(events.map((e) => e.sourceType))).sort();

  const filteredEvents = events.filter((e) => {
    if (statusFilter === "active" && e.status !== "active") return false;
    if (statusFilter === "draft" && (e.status !== "draft" || e.sourceType !== "direct_submission")) return false;
    if (sourceFilter !== "all" && e.sourceType !== sourceFilter) return false;

    if (dateFilter !== "all") {
      const eventDate = new Date(e.startAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      if (dateFilter === "tonight" && (eventDate < today || eventDate >= tomorrow)) return false;
      if (dateFilter === "this_week" && (eventDate < today || eventDate >= nextWeek)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.venueName || "").toLowerCase().includes(q)
      );
    }

    return true;
  });

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const data = await fetchAdminEventsAction();
      setEvents(data);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Lazy-load quality / integrity data when those tabs are first visited
  useEffect(() => {
    if (activeTab === "quality" && overview === null) {
      fetchOverviewAction().then(setOverview);
    }
    if (activeTab === "integrity" && integrityStats === null) {
      Promise.all([
        fetchVerificationLogsAction("all", 200),
        fetchVerificationStatsAction(),
      ]).then(([logs, stats]) => {
        setIntegrityLogs(logs);
        setIntegrityStats(stats);
      });
    }
  }, [activeTab, overview, integrityStats]);

  // ── Approve draft event ───────────────────────────────────────────────────

  const handleApproveEvent = useCallback(async (eventId: string) => {
    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: "active" } : e))
    );

    try {
      const response = await fetch(`/api/v1/admin/events/${eventId}/publish`, {
        method: "POST",
        headers: { "x-api-key": "test-key-whim" },
      });
      if (!response.ok) throw new Error("Publish failed");
    } catch {
      // Revert optimistic update on failure
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, status: "draft" } : e))
      );
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      {/* ── Top nav bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 bg-black border-b border-zinc-800 shrink-0">
        <h1 className="text-sm font-semibold text-white tracking-tight">
          <span className="text-indigo-400 mr-1.5">◈</span>Whim Admin
        </h1>

        {/* Tab bar */}
        <nav className="flex items-center gap-1 ml-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Navigation links */}
        <a
          href="/admin/sources"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Sources
        </a>
        <a
          href="/feed"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Consumer Feed ↗
        </a>

        {/* + Add Event */}
        <button
          onClick={() => setIsAddEventOpen(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          <span className="text-base leading-none">+</span>
          Add Event
        </button>
      </div>

      {/* ── Tab: Events ──────────────────────────────────────────────────── */}
      {activeTab === "events" && (
        <>
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
          <div className="flex-1 overflow-hidden flex flex-col">
            {isLoadingEvents ? (
              <div className="flex items-center justify-center flex-1 gap-2 text-zinc-600 text-sm">
                <span className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                Loading events…
              </div>
            ) : (
              <EventsTable
                events={filteredEvents}
                onApproveEvent={handleApproveEvent}
              />
            )}
          </div>
        </>
      )}

      {/* ── Tab: Data Quality ────────────────────────────────────────────── */}
      {activeTab === "quality" && (
        <div className="flex-1 overflow-auto">
          {overview === null ? (
            <div className="flex items-center justify-center h-40 gap-2 text-zinc-600 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
              Loading quality data…
            </div>
          ) : (
            <DataQualityTab
              overview={overview}
              onOverviewRefresh={setOverview}
            />
          )}
        </div>
      )}

      {/* ── Tab: Integrity ───────────────────────────────────────────────── */}
      {activeTab === "integrity" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {integrityStats === null ? (
            <div className="flex items-center justify-center h-40 gap-2 text-zinc-600 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
              Loading integrity logs…
            </div>
          ) : (
            <IntegrityTab
              initialLogs={integrityLogs}
              initialStats={integrityStats}
            />
          )}
        </div>
      )}

      {/* ── Add Event modal ───────────────────────────────────────────────── */}
      {isAddEventOpen && (
        <AddEventModal
          isOpen={isAddEventOpen}
          onClose={() => setIsAddEventOpen(false)}
          onEventAdded={() => {
            setIsAddEventOpen(false);
            loadEvents(); // Refresh table
          }}
        />
      )}
    </div>
  );
}
