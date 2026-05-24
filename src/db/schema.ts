import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  doublePrecision,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────

export const sourceTypeEnum = pgEnum("source_type", [
  "eventbrite_api",
  "ticketmaster_api",
  "dice_api",
  "seatgeek_api",
  "ical",
  "rss",
  "email",
  "submission",
  "scrape",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "active",
  "cancelled",
  "expired",
  "draft",
]);

export const categoryEnum = pgEnum("event_category", [
  "music",
  "comedy",
  "art",
  "theater",
  "food_drink",
  "fitness",
  "community",
  "nightlife",
  "family",
  "sports",
  "film",
  "other",
]);

// ─── Venues ──────────────────────────────────────────────
// Discovered via Google Places, platform APIs, or manual entry.
// One venue can have many events and many ingestion sources.

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    websiteUrl: text("website_url"),
    googlePlaceId: text("google_place_id"),
    claimed: boolean("claimed").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("venues_lat_lng_idx").on(table.lat, table.lng),
    uniqueIndex("venues_google_place_idx").on(table.googlePlaceId),
  ]
);

// ─── Events ──────────────────────────────────────────────
// The core table. Every source (Eventbrite, ical, email, etc.)
// normalizes into this single shape. Location fields are
// denormalized from the venue for query performance.

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Link to source platform (for dedup + updates)
    externalId: text("external_id"),
    sourceType: sourceTypeEnum("source_type").notNull(),

    // Venue relationship
    venueId: uuid("venue_id").references(() => venues.id),

    // Core event info
    title: text("title").notNull(),
    description: text("description"),
    category: categoryEnum("category").default("other"),
    imageUrl: text("image_url"),

    // When
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at"),
    recurrenceRule: text("recurrence_rule"), // RFC 5545 RRULE

    // Where (denormalized from venue for fast geo queries)
    venueName: text("venue_name"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),

    // Pricing
    isFree: boolean("is_free").default(false),
    priceMin: doublePrecision("price_min"),
    priceMax: doublePrecision("price_max"),
    currency: text("currency").default("USD"),

    // Ticketing
    ticketUrl: text("ticket_url"),
    platform: text("platform"), // eventbrite, dice, ticketmaster, etc.

    // Data quality
    confidenceScore: doublePrecision("confidence_score").default(1.0),
    isVerified: boolean("is_verified").default(false),

    // Lifecycle
    status: eventStatusEnum("status").default("active"),

    // Keep the raw source payload for debugging and reprocessing
    rawSource: jsonb("raw_source"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Dedup: same event from same source should not be inserted twice
    uniqueIndex("events_source_dedup_idx").on(
      table.externalId,
      table.sourceType
    ),
    // Location queries: bounding box filter on lat/lng
    index("events_lat_lng_idx").on(table.lat, table.lng),
    // Date range queries
    index("events_start_at_idx").on(table.startAt),
    // Filter by status (most queries want active only)
    index("events_status_idx").on(table.status),
    // Filter by category
    index("events_category_idx").on(table.category),
  ]
);

// ─── Ingestion sources ───────────────────────────────────
// Tracks how each venue's events are fetched.
// One venue might have an Eventbrite API source AND an ical feed.
// The worker scheduler reads this table to know what to poll.

export const ingestionSources = pgTable(
  "ingestion_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id").references(() => venues.id),
    type: sourceTypeEnum("type").notNull(),

    // Source-specific config:
    // ical:      { feedUrl: "https://venue.com/events.ics" }
    // email:     { inboxAddress: "venue-slug@ingest.yourdomain.com" }
    // api:       { platformId: "12345", endpoint: "..." }
    // scrape:    { calendarPageUrl: "https://venue.com/events" }
    config: jsonb("config"),

    lastSyncedAt: timestamp("last_synced_at"),
    syncStatus: text("sync_status").default("active"), // active, paused, error
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ingestion_sources_venue_idx").on(table.venueId),
    index("ingestion_sources_status_idx").on(table.syncStatus),
  ]
);

// ─── API keys ────────────────────────────────────────────
// B2B customers authenticate with API keys.
// Simple flat table, no OAuth complexity for MVP.

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    tier: text("tier").default("free"), // free, starter, pro
    callsToday: doublePrecision("calls_today").default(0),
    callLimit: doublePrecision("call_limit").default(100),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("api_keys_key_idx").on(table.key)]
);
