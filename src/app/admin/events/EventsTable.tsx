"use client";

import { useState } from "react";
import { AdminEvent } from "./types";
import { formatPrice } from "@/lib/utils/formatPrice";
import { getSourceMeta } from "@/lib/utils/sourceColors";
import { getCategoryMeta } from "@/lib/utils/categoryColors";
import { VERIFICATION_STATUS_META } from "@/app/admin/verification/types";

// ─── Field completeness indicator ────────────────────────────────────────────

interface CompletenessBarProps {
  event: AdminEvent;
}

function CompletenessBar({ event }: CompletenessBarProps) {
  const slots = [
    { key: "coords", ok: event.lat !== null && event.lng !== null, label: "Coords" },
    { key: "image",  ok: Boolean(event.imageUrl),                  label: "Image" },
    { key: "desc",   ok: Boolean(event.description),               label: "Description" },
    { key: "cat",    ok: Boolean(event.category && event.category !== "other"), label: "Category" },
  ];

  return (
    <div className="flex items-center gap-px" title={slots.map((s) => `${s.label}: ${s.ok ? "✓" : "✗"}`).join(" · ")}>
      {slots.map((slot) => (
        <div
          key={slot.key}
          className={`h-1.5 w-3.5 rounded-sm ${slot.ok ? "bg-emerald-500" : "bg-red-800"}`}
        />
      ))}
    </div>
  );
}

// ─── Verification status badge ────────────────────────────────────────────────

function VerificationBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        unchecked
      </span>
    );
  }

  const meta =
    VERIFICATION_STATUS_META[status as keyof typeof VERIFICATION_STATUS_META];
  if (!meta) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.badgeBg} ${meta.badgeText}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
      {meta.label}
    </span>
  );
}

// ─── Expandable row detail panel ──────────────────────────────────────────────

interface EventDetailPanelProps {
  event: AdminEvent;
  onApprove: (id: string) => void;
}

function EventDetailPanel({ event, onApprove }: EventDetailPanelProps) {
  const fields: { label: string; value: string | number | boolean | null | undefined; missing?: boolean }[] = [
    { label: "ID",           value: event.id },
    { label: "Status",       value: event.status },
    { label: "Source",       value: event.sourceType },
    { label: "Category",     value: event.category,                 missing: !event.category || event.category === "other" },
    { label: "Address",      value: event.address,                  missing: !event.address },
    { label: "Lat / Lng",    value: event.lat !== null ? `${event.lat?.toFixed(5)}, ${event.lng?.toFixed(5)}` : null, missing: event.lat === null },
    { label: "Start",        value: event.startAt.toLocaleString("en-US") },
    { label: "End",          value: event.endAt?.toLocaleString("en-US") ?? null },
    { label: "Price",        value: formatPrice(event.isFree ?? false, event.priceMin ?? null, event.priceMax ?? null, event.ticketUrl ?? null) },
    { label: "Image URL",    value: event.imageUrl,                 missing: !event.imageUrl },
    { label: "Description",  value: event.description ? event.description.slice(0, 140) + (event.description.length > 140 ? "…" : "") : null, missing: !event.description },
    { label: "Confidence",   value: event.confidenceScore !== null ? `${((event.confidenceScore ?? 0) * 100).toFixed(0)}%` : null },
    { label: "Verified",     value: event.isVerified ? "Yes" : "No" },
    { label: "Coord Δ",      value: event.coordDeltaMeters !== null ? `${event.coordDeltaMeters?.toFixed(0)} m` : null },
  ];

  return (
    <tr>
      <td colSpan={8} className="bg-zinc-900 border-b border-zinc-800">
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 mb-4">
            {fields.map(({ label, value, missing }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">{label}</p>
                <p
                  className={`text-xs mt-0.5 font-mono break-all ${
                    value === null || value === undefined
                      ? missing
                        ? "text-red-500 italic"
                        : "text-zinc-600 italic"
                      : missing
                      ? "text-amber-400"
                      : "text-zinc-200"
                  }`}
                >
                  {value !== null && value !== undefined ? String(value) : "—"}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
            {event.ticketUrl && (
              <a
                href={event.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
              >
                ↗ View Ticket URL
              </a>
            )}
            {event.status === "draft" && (
              <button
                onClick={() => onApprove(event.id)}
                className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                ✓ Approve Submission
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

interface EventsTableProps {
  events: AdminEvent[];
  onApproveEvent: (eventId: string) => void;
}

export default function EventsTable({ events, onApproveEvent }: EventsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
        No events match the current filters.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left text-sm text-zinc-400 border-collapse">
        <thead className="sticky top-0 bg-zinc-950 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 z-10 font-mono">
          <tr>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Venue</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Integrity</th>
            <th className="px-4 py-3">Fields</th>
          </tr>
        </thead>
        <tbody>
          {events.map((evt) => {
            const sourceMeta = getSourceMeta(evt.sourceType);
            const categoryMeta = getCategoryMeta(evt.category);
            const isExpanded = expandedId === evt.id;

            return [
              <tr
                key={evt.id}
                onClick={() => toggleRow(evt.id)}
                className={`cursor-pointer transition-colors border-b border-zinc-800/60 ${
                  isExpanded
                    ? "bg-zinc-900"
                    : "hover:bg-zinc-900/60"
                }`}
              >
                {/* Source badge */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sourceMeta.idleBg} ${sourceMeta.idleText} ${sourceMeta.idleBorder}`}
                  >
                    {sourceMeta.abbr}
                  </span>
                </td>

                {/* Title */}
                <td className="px-4 py-2.5 max-w-[220px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`transition-transform duration-150 text-zinc-600 text-xs ${isExpanded ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    <div className="min-w-0">
                      <p className="text-zinc-200 font-medium truncate" title={evt.title}>
                        {evt.title}
                      </p>
                      {evt.moreDates && evt.moreDates > 0 ? (
                        <p className="text-[10px] text-zinc-600 mt-0.5">+{evt.moreDates} more dates</p>
                      ) : null}
                    </div>
                  </div>
                </td>

                {/* Venue */}
                <td className="px-4 py-2.5 max-w-[160px]">
                  <span className="truncate block text-zinc-400" title={evt.venueName ?? ""}>
                    {evt.venueName ?? <span className="text-red-600 italic text-xs">missing</span>}
                  </span>
                </td>

                {/* Time */}
                <td className="px-4 py-2.5 whitespace-nowrap text-zinc-400">
                  {new Date(evt.startAt).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>

                {/* Price */}
                <td className="px-4 py-2.5 whitespace-nowrap text-zinc-400">
                  {formatPrice(evt.isFree ?? false, evt.priceMin ?? null, evt.priceMax ?? null, evt.ticketUrl ?? null)}
                </td>

                {/* Category */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {evt.category && evt.category !== "other" ? (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryMeta.bgClass} ${categoryMeta.textClass}`}
                    >
                      {evt.category}
                    </span>
                  ) : (
                    <span className="text-zinc-700 text-xs italic">—</span>
                  )}
                </td>

                {/* Verification status */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <VerificationBadge status={evt.verificationStatus} />
                </td>

                {/* Field completeness */}
                <td className="px-4 py-2.5">
                  <CompletenessBar event={evt} />
                </td>
              </tr>,

              // Expanded detail panel
              isExpanded ? (
                <EventDetailPanel key={`${evt.id}-detail`} event={evt} onApprove={onApproveEvent} />
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
