import { pgTable, text, timestamp, boolean, uuid, jsonb, doublePrecision, varchar, integer } from 'drizzle-orm/pg-core';

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  websiteUrl: text('website_url'),
  googlePlaceId: text('google_place_id').unique(),
  claimed: boolean('claimed').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // e.g. 'eventbrite', 'dice', 'email'
  venueId: uuid('venue_id').references(() => venues.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  imageUrl: text('image_url'),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at'),
  recurrenceRule: text('recurrence_rule'),
  venueName: text('venue_name'),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  isFree: boolean('is_free').default(false),
  priceMin: doublePrecision('price_min'),
  priceMax: doublePrecision('price_max'),
  currency: varchar('currency', { length: 3 }),
  ticketUrl: text('ticket_url'),
  platform: varchar('platform', { length: 50 }),
  confidenceScore: doublePrecision('confidence_score').default(1.0),
  isVerified: boolean('is_verified').default(false),
  status: varchar('status', { length: 20 }).default('active'), // active, cancelled, expired, draft
  rawSource: jsonb('raw_source'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ingestionSources = pgTable('ingestion_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').references(() => venues.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // platform_api, ical, email, etc.
  config: jsonb('config'), // feedUrl, apiKey, etc.
  lastSyncedAt: timestamp('last_synced_at'),
  syncStatus: varchar('sync_status', { length: 20 }).default('active'), // active, paused, error
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  tier: varchar('tier', { length: 20 }).default('free'), // free, starter, pro
  callsToday: integer('calls_today').default(0),
  callLimit: integer('call_limit').default(1000),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
