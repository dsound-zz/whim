/**
 * sourceColors.ts
 *
 * Canonical source-type display metadata for all admin and feed surfaces.
 * Any component that needs to color-code, label, or abbreviate a sourceType
 * should import from here rather than defining its own mapping.
 */

export interface SourceMeta {
  /** Short human-readable label (e.g. "Ticketmaster", "NYC Parks") */
  label: string;
  /** 2–5 char abbreviation used in compact table badges */
  abbr: string;
  /** Tailwind class for the badge background in idle state */
  idleBg: string;
  /** Tailwind class for badge text in idle state */
  idleText: string;
  /** Tailwind class for badge border in idle state */
  idleBorder: string;
  /** Tailwind class for badge background in active/selected state */
  activeBg: string;
  /** Tailwind class for badge text in active/selected state */
  activeText: string;
  /** Hex color used for Mapbox GL circle markers */
  markerHex: string;
}

const SOURCE_META_MAP: Record<string, SourceMeta> = {
  ticketmaster_api: {
    label: 'Ticketmaster',
    abbr: 'TM',
    idleBg: 'bg-blue-500/15',
    idleText: 'text-blue-400',
    idleBorder: 'border-blue-500/30',
    activeBg: 'bg-blue-500',
    activeText: 'text-white',
    markerHex: '#3b82f6',
  },
  eventbrite_api: {
    label: 'Eventbrite',
    abbr: 'EB',
    idleBg: 'bg-red-500/15',
    idleText: 'text-red-400',
    idleBorder: 'border-red-500/30',
    activeBg: 'bg-red-500',
    activeText: 'text-white',
    markerHex: '#ef4444',
  },
  dice_scrape: {
    label: 'Dice',
    abbr: 'DICE',
    idleBg: 'bg-orange-500/15',
    idleText: 'text-orange-400',
    idleBorder: 'border-orange-500/30',
    activeBg: 'bg-orange-500',
    activeText: 'text-white',
    markerHex: '#f97316',
  },
  songkick_scrape: {
    label: 'Songkick',
    abbr: 'SK',
    idleBg: 'bg-pink-500/15',
    idleText: 'text-pink-400',
    idleBorder: 'border-pink-500/30',
    activeBg: 'bg-pink-500',
    activeText: 'text-white',
    markerHex: '#be185d',
  },
  seatgeek_api: {
    label: 'SeatGeek',
    abbr: 'SG',
    idleBg: 'bg-teal-500/15',
    idleText: 'text-teal-400',
    idleBorder: 'border-teal-500/30',
    activeBg: 'bg-teal-500',
    activeText: 'text-white',
    markerHex: '#14b8a6',
  },
  nyc_parks_api: {
    label: 'NYC Parks',
    abbr: 'PARKS',
    idleBg: 'bg-green-600/15',
    idleText: 'text-green-400',
    idleBorder: 'border-green-600/30',
    activeBg: 'bg-green-600',
    activeText: 'text-white',
    markerHex: '#15803d',
  },
  ra_scrape: {
    label: 'Resident Advisor',
    abbr: 'RA',
    idleBg: 'bg-yellow-500/15',
    idleText: 'text-yellow-400',
    idleBorder: 'border-yellow-500/30',
    activeBg: 'bg-yellow-500',
    activeText: 'text-black',
    markerHex: '#c026d3',
  },
  ical: {
    label: 'iCal Feed',
    abbr: 'ICAL',
    idleBg: 'bg-emerald-500/15',
    idleText: 'text-emerald-400',
    idleBorder: 'border-emerald-500/30',
    activeBg: 'bg-emerald-500',
    activeText: 'text-white',
    markerHex: '#22c55e',
  },
  email: {
    label: 'Email',
    abbr: 'EMAIL',
    idleBg: 'bg-purple-500/15',
    idleText: 'text-purple-400',
    idleBorder: 'border-purple-500/30',
    activeBg: 'bg-purple-500',
    activeText: 'text-white',
    markerHex: '#a855f7',
  },
  direct_submission: {
    label: 'Submission',
    abbr: 'SUB',
    idleBg: 'bg-lime-500/15',
    idleText: 'text-lime-400',
    idleBorder: 'border-lime-500/30',
    activeBg: 'bg-lime-500',
    activeText: 'text-black',
    markerHex: '#10b981',
  },
};

/** Fallback meta for unknown source types. */
const UNKNOWN_SOURCE_META: SourceMeta = {
  label: 'Unknown',
  abbr: 'OTH',
  idleBg: 'bg-zinc-700/30',
  idleText: 'text-zinc-400',
  idleBorder: 'border-zinc-600/30',
  activeBg: 'bg-zinc-600',
  activeText: 'text-white',
  markerHex: '#6b7280',
};

/**
 * Returns the display metadata for a given sourceType string.
 * Falls back to neutral grey metadata for unrecognised sources.
 */
export function getSourceMeta(sourceType: string): SourceMeta {
  // Direct hit
  if (SOURCE_META_MAP[sourceType]) return SOURCE_META_MAP[sourceType];

  // Partial match — handle e.g. "direct_submission_v2" still hitting the right entry
  for (const [key, meta] of Object.entries(SOURCE_META_MAP)) {
    if (sourceType.includes(key) || key.includes(sourceType)) return meta;
  }

  return UNKNOWN_SOURCE_META;
}

/** Returns the Tailwind badge class string for idle state. */
export function getSourceBadgeClasses(sourceType: string): string {
  const meta = getSourceMeta(sourceType);
  return `${meta.idleBg} ${meta.idleText} border ${meta.idleBorder}`;
}

/** Returns the Tailwind badge class string for active/selected state. */
export function getSourceActiveBadgeClasses(sourceType: string): string {
  const meta = getSourceMeta(sourceType);
  return `${meta.activeBg} ${meta.activeText} border ${meta.activeBg}`;
}

/** Returns the Mapbox marker hex color for a source type. */
export function getSourceMarkerHex(sourceType: string): string {
  return getSourceMeta(sourceType).markerHex;
}

/** All known source type keys, for use in dropdowns or iteration. */
export const ALL_SOURCE_TYPES = Object.keys(SOURCE_META_MAP);
