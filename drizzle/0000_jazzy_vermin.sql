CREATE TYPE "public"."event_category" AS ENUM('music', 'comedy', 'art', 'theater', 'food_drink', 'fitness', 'community', 'nightlife', 'family', 'sports', 'film', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('active', 'cancelled', 'expired', 'draft');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('eventbrite_api', 'ticketmaster_api', 'dice_api', 'dice_scrape', 'seatgeek_api', 'ical', 'rss', 'email', 'submission', 'scrape', 'ra_scrape', 'nyc_parks_api', 'songkick_scrape');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('verified', 'flagged_content', 'flagged_coordinates', 'flagged_both', 'skipped', 'error');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"tier" text DEFAULT 'free',
	"calls_today" double precision DEFAULT 0,
	"call_limit" double precision DEFAULT 100,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_verification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"status" "verification_status" NOT NULL,
	"page_text_snippet" text,
	"llm_confirmed" boolean,
	"llm_reason" text,
	"stored_lat" double precision,
	"stored_lng" double precision,
	"mapbox_lat" double precision,
	"mapbox_lng" double precision,
	"coord_delta_meters" double precision,
	"mismatch_reason" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"source_type" "source_type" NOT NULL,
	"venue_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"category" "event_category" DEFAULT 'other',
	"image_url" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"recurrence_rule" text,
	"venue_name" text,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"is_free" boolean DEFAULT false,
	"price_min" double precision,
	"price_max" double precision,
	"currency" text DEFAULT 'USD',
	"ticket_url" text,
	"ticket_urls" jsonb DEFAULT '[]'::jsonb,
	"platform" text,
	"merged_source_ids" jsonb DEFAULT '[]'::jsonb,
	"confidence_score" double precision DEFAULT 1,
	"is_verified" boolean DEFAULT false,
	"status" "event_status" DEFAULT 'active',
	"raw_source" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid,
	"type" "source_type" NOT NULL,
	"config" jsonb,
	"last_synced_at" timestamp,
	"sync_status" text DEFAULT 'active',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"website_url" text,
	"google_place_id" text,
	"claimed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_verification_logs" ADD CONSTRAINT "event_verification_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD CONSTRAINT "ingestion_sources_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_idx" ON "api_keys" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "evl_event_id_idx" ON "event_verification_logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "evl_checked_at_idx" ON "event_verification_logs" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "evl_status_idx" ON "event_verification_logs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_dedup_idx" ON "events" USING btree ("external_id","source_type");--> statement-breakpoint
CREATE INDEX "events_lat_lng_idx" ON "events" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "events_start_at_idx" ON "events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ingestion_sources_venue_idx" ON "ingestion_sources" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "ingestion_sources_status_idx" ON "ingestion_sources" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "venues_lat_lng_idx" ON "venues" USING btree ("lat","lng");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_google_place_idx" ON "venues" USING btree ("google_place_id");