# Whim Context

This file is used for all references and updates for context in development of the Whim project.

# Project Context
You are a senior software engineer acting as an autonomous agent on this project. 
- **Core Stack:** TypeScript, Next.js, Drizzle ORM, Neon Postgres
- **Supporting Tech:** Tailwind CSS, Neon Postgres (PostGIS enabled), Mapbox GL JS, Playwright
- **Goal:** Build scalable, maintainable, and highly performant features following industry best practices.

# Agentic Behavior & Workflow (CRITICAL)
- **Plan First:** Before writing or modifying any code for a complex task, output a brief step-by-step implementation plan. 
- **Think in Slices:** Implement features vertically (e.g., Database -> API -> UI) in small, testable chunks rather than writing an entire monolithic layer at once.
- **Self-Correction:** If you run a terminal command (like a linter, test, or build script) and it fails, read the error message, analyze why it failed, and attempt to fix it before asking for human intervention.
- **Do Not Hallucinate Dependencies:** Only use libraries already present in the package manager file (e.g., `package.json`, `requirements.txt`). If a new library is absolutely necessary, ask for permission to install it first.

# Architectural Constraints
- **Separation of Concerns:** Never query the database directly from route handlers or UI components. All database access goes through service functions in /src/lib/db/. Ingestion logic lives in /src/lib/ingestion/. Scripts in /scripts/ import from /src/lib/ — they never contain raw SQL or Drizzle calls directly.
- **Directory Structure:** Reusable UI components go in /src/components/ui/. Page-specific components go in /src/app/(route)/components/. Shared utilities go in /src/lib/utils/. Ingestion workers go in /src/lib/ingestion/. Standalone scripts (for Railway cron jobs) go in /scripts/. Types shared across the app go in /src/types/.
- **State Management:** Prefer local component state (useState, useReducer). No global state library for MVP. Server state (events, ingestion status) is fetched server-side and passed as props. Client components handle UI state only.

# Naming Conventions
- **Highly Descriptive:** Use clear, semantic names for all variables, functions, and classes (e.g., use `userAuthenticationStatus` instead of `authStat` or `status`). 
- **No Single-Character Variables:** Absolutely no single-character variables (like `x`, `d`, `e`, `v`) unless they are universally accepted conventions in a strictly limited scope (e.g., `i`, `j` in standard `for` loops, or `x`, `y` for 2D coordinates).
- **Action-Oriented Functions:** Function names must clearly state their action and return value (e.g., `fetchUserProfile`, `calculateOrderTotal`, `isUserLoggedIn`).
- **Booleans:** Prefix boolean variables with `is`, `has`, or `should` (e.g., `isLoading`, `hasError`).

# Coding Standards & Style
- **Type Safety:** No any types. Define explicit interfaces for all data structures in /src/types/. Use Drizzle's inferred types (InferSelectModel, InferInsertModel) for database row types rather than redefining them.
- **Error Handling:** Wrap external calls and database queries in appropriate error handling (e.g., `try/catch` blocks). Always handle edge cases gracefully and avoid silent failures.
- **Comments & Documentation:** Do not comment on obvious code. Use comments only to explain *why* a specific approach was taken if it is complex or non-standard.

# Troubleshooting & Maintenance

## Seeding & Syncing Venue Overrides
If a venue's coordinates are geocoded incorrectly (e.g., Mapbox fails or a scraper returns generic/inaccurate coordinates), you can define a manual override:
1. Add the venue name, correct address, and coordinates (lat/lng) to the `overrides` array in `scripts/seed-venues.ts`.
2. Seed the database with the updated overrides:
   ```bash
   npm run db:seed-venues
   ```
3. Sync existing events in the database with the updated coordinates:
   ```bash
   npm run db:sync-events
   ```

*Note:* Seeding the database updates the `venues` table so future events are geocoded correctly. Syncing updates the `events` table (which denormalizes location) so currently imported events are corrected.

## Running the Event Integrity Smoke Test
The integrity check fetches each event's `ticketUrl` and re-geocodes its venue to catch stale links and coordinate drift.

Run manually against a small batch:
```bash
npm run verify:integrity -- --limit 10
```

Run against a specific ingestion source only:
```bash
npm run verify:integrity -- --limit 50 --source nyc_parks_api
```

View results in the admin dashboard at `/admin/verification`.

Key thresholds:
- Coordinate flag: **> 500 meters** between stored coords and Mapbox re-geocode
- LLM model: `gemini-2.5-flash` with `temperature: 0` and JSON mode
- JS-heavy domains (`dice.fm`) are skipped in the content check (no Playwright in smoke-test path)
- Page text is capped at 8,000 characters before being sent to the LLM; 5,000 characters are stored in `pageTextSnippet` for debugging

# Whim — Project Prompt for Antigravity

## What Whim is

Whim is a B2B local events data platform. It aggregates, normalizes, geocodes, and deduplicates local event data from multiple sources into one unified API that other companies build on. The consumer value proposition is spontaneous, approachable local event discovery — "what's happening near me tonight" — an everything aggregator with simple UI that removes friction for spontaneous going out, not planning weeks ahead. But the primary business is the data infrastructure underneath.

Whim is NOT a ticketing platform. Eventbrite, Ticketmaster, and Dice are data sources Whim pulls from, not competitors. Whim is to local events what Kayak is to flights: a meta-aggregator that normalizes data from multiple platforms plus sources those platforms don't cover.

## Business model

Three revenue layers, built in order:

1. B2B data API (core): companies pay monthly subscriptions for access to the normalized event feed. Tiered by city coverage, freshness, and call volume. Target customers: city guide apps, hospitality platforms, local media, concierge tools, real estate apps.
2. Venue premium listings: free listing for all venues. Paid tier ($50-150/month) for verified badge, featured placement, direct submission, and analytics. Yelp model.
3. Consumer affiliate/booking (later): ticket click-throughs to Eventbrite/Ticketmaster generate affiliate revenue once consumer traffic exists.

## Source hierarchy (cleanest to messiest)

1. Platform APIs:
   - Ticketmaster API (commercial ticketed events)
   - Dice.fm (indie music, Playwright scraper)
   - Eventbrite API (community and cultural events)
   - NYC Parks Open Data / Socrata (free outdoor events)
   - Songkick Playwright scraper (music venues, ~4000 NYC events)

Enrichment (post-ingestion, not primary sources):
   - Bandsintown API (artist images and popularity signals for null imageUrl events)

2. ical/RSS feeds — auto-generated by Squarespace, WordPress (The Events Calendar), Wix. Check venue.com/events.ics or venue.com/events?format=ical. Fully structured.
3. Email newsletters — dedicated subscribed inboxes. LLM parsing required. Handles the long-tail venues not on any platform. Push-based, legal, the most important source for hyperlocal events nobody else has.
4. Direct venue submission — venues email a dedicated address or use a web form. Premium/verified tier.
5. Venue calendar page scraping — last resort. Headless browser required for JS-heavy sites.

Rule: for each venue, use the cleanest available source. Most venues are covered by the first three tiers.

## Venue calendar page link resolution

Many venue calendar pages don't contain event data inline — they link out to ticketing platforms. The architecture detects the link domain and routes to the appropriate handler:

- Links to dice.fm → parse Dice page (consistent template) or use Dice API
- Links to eventbrite.com → use Eventbrite API
- Links to ticketmaster.com → use Ticketmaster API
- Links to resident advisor → parse RA page
- Links to venue's own detail page → web fetch + LLM extraction

This reduces the scraping problem from N custom venue scrapers to a short list of platform parsers.

## Tech stack

- Runtime: Node.js (>=20.0.0) + TypeScript
- Framework: Next.js (API routes + eventual consumer frontend)
- ORM: Drizzle
- Database: Neon Postgres with PostGIS extension
- Deployment: Railway (core web + scrapers) and Vercel (for serverless crons).
            - Web service: Next.js app (always-on, Railway)
            - Cron service: sync-ticketmaster (every 6 hours, Railway)
            - Cron service: sync-eventbrite (every 6 hours, Railway)
            - Cron service: scrape-dice (nightly at 2am, Railway)
            - Cron service: sync-nyc-parks (daily at 8am, runs on Vercel Cron not Railway since it requires no headless browser)
            - Cron service: run-integrity-check (nightly, Railway) — event integrity smoke test
            All services share the same Neon DATABASE_URL.
- Geocoding: Mapbox Geocoding API (NYC bounding-box restricted)
- Auth: simple API key lookup for B2B customers (no OAuth for MVP)
- LLM: Google Gemini API (gemini-2.5-flash, JSON mode) — used for event content verification
- Email ingestion (later): Mailgun or Postmark inbound routing

## Database schema (5 tables)

### venues
Discovered via Google Places or extracted from platform APIs. Canonical location data. Fields: id, name, address, lat, lng, websiteUrl, googlePlaceId, claimed, createdAt, updatedAt. Indexed on (lat, lng) and unique on googlePlaceId.

### events
The core table. Every source normalizes into this single shape. Location denormalized from venue for query performance. Key fields: id, externalId, sourceType, venueId, title, description, category, imageUrl, startAt, endAt, recurrenceRule (RFC 5545 RRULE), venueName, address, lat, lng, isFree, priceMin, priceMax, currency, ticketUrl, platform, confidenceScore, isVerified, status (active/cancelled/expired/draft), rawSource (jsonb), createdAt, updatedAt. Dedup index on (externalId, sourceType). Indexed on (lat, lng), startAt, status, category.

### ingestionSources
Tracks how each venue's events are fetched. The worker scheduler reads this table. Fields: id, venueId, type, config (jsonb with feedUrl/apiKey/inboxAddress), lastSyncedAt, syncStatus (active/paused/error), errorMessage, createdAt. One venue can have multiple ingestion sources.

### apiKeys
B2B customer auth. Fields: id, key, customerName, customerEmail, tier (free/starter/pro), callsToday, callLimit, lastResetAt, isActive, createdAt.

### eventVerificationLogs
Stores the result of each event integrity smoke test. One row per event (upserted on eventId — always reflects the most recent check). Fields: id, eventId (FK → events, cascade delete), checkedAt, status (verified/flagged_content/flagged_coordinates/flagged_both/skipped/error), pageTextSnippet (first 5k chars of fetched page for debugging), llmConfirmed (bool), llmReason (text), storedLat, storedLng, mapboxLat, mapboxLng, coordDeltaMeters, mismatchReason, errorMessage. Unique index on eventId; indexes on checkedAt and status.

## Architecture (4-stage pipeline)

Sources → Workers → Event Store → Delivery

- Sources: platform APIs polled daily, ical/RSS polled every few hours, email via webhook/polling, web scrape nightly
- Workers: parse, normalize to schema, geocode, deduplicate. Scheduled via Vercel Cron. No human intervention.
- Event store: Postgres/PostGIS. Events have lifecycle: new → active → updated → expired/cancelled.
- Delivery: B2B REST API (key auth, filter by lat/lng radius + date range + category), consumer app (reads same store), venue portal (claim/edit/submit).

## Current phase

Phase 1 (MVP) is complete:
- Ingesting structured events via Ticketmaster API (NYC).
- Ingesting unstructured events via headless Playwright scraping from Dice.fm (NYC).
- Ingesting/verifying Eventbrite API ingestion (mock data fallback when no key is supplied).
- Normalizing to schema, storing in Postgres, and deduplicating recurring events using raw SQL window functions.
- Geocoding venues using Mapbox Geocoding API with strict bounding boxes (NYC).
- Built an internal Admin Visualization Dashboard (`/admin/events`) with Mapbox GL JS clustering, event toggling, date filtering, and missing-geo statistics.
- Built a query-time cross-platform event deduplication helper that clusters identical events from multiple platforms and combines ticketing sources.
- Built the Consumer Feed UI (`/feed`) and Event Detail view (`/feed/[id]`) with a "Compare Tickets" price/platform comparison component.
- Shared `formatPrice` utility handling complex edge cases (free vs range vs unknown).
- Refactored TM and Eventbrite ingestion into standalone scripts in /scripts/ callable by Railway cron services independently of the Next.js app.
- Configured Railway deployment: web service + three cron services.
- Ingesting NYC Parks events via NYC Open Data Socrata API (free, no auth, covers outdoor concerts, festivals, ranger programs, and community events that commercial platforms do not have).
- Ingesting music venue events via Songkick Playwright scraper (NYC metro area).
- Running Bandsintown as a post-ingestion enrichment layer to fill null imageUrl fields on music events using artist lookup by name.
- Built the B2B API Auth layer (validating API keys and enforcing rate limits via `src/proxy.ts` middleware) and the public `/api/v1/events` endpoint (performing bounding box queries, date/category filtering, and pagination).
- Fixed Railway deployment by adding `RUN npm run build` to the Dockerfile and compiling the Next.js app during image builds, resolving issues with missing `.next` directories.
- Updated `src/db/index.ts` to fall back to a placeholder DATABASE_URL when the environment variable is not injected during docker compile-time.

Phase 2 — Data Integrity layer (complete 2026-05-29):
- Built `verifyEventIntegrity()` service (`src/lib/verification/verifyEventIntegrity.ts`) that runs two checks:
  1. **Content check**: fetches the event's `ticketUrl`, strips HTML, and sends page text to Gemini 2.5 Flash in JSON mode (enforced with native `systemInstruction` and `responseSchema` constrained decoding to prevent raw text parse errors). JS-heavy domains (dice.fm) are gracefully skipped.
  2. **Coordinate check**: re-geocodes the venue via Mapbox (NYC bounding box) and computes Haversine distance in meters between stored coords and freshly-returned ones. Flags mismatches > 500m. Bypassed entirely when content check is skipped/un-scrapeable (e.g. Songkick, Ticketmaster), resolving false-positive geocoding drifts.
- Added graceful handling of hard HTTP 404s (during fetch phase) and soft 404s (redirects to generic daily calendars where the LLM disconfirms the event/venue), automatically marking affected events as `expired` in the DB via the new `updateEventStatus()` service in `src/lib/db/eventService.ts`.
- Added `event_verification_logs` table (5th table in schema) with `verificationStatusEnum` (verified/flagged_content/flagged_coordinates/flagged_both/skipped/error). Upserts on `eventId` so each event always has exactly one latest result. Live in Neon.
- Built `verificationService.ts` DB service (`src/lib/db/`) with `saveVerificationLog`, `fetchVerificationLogs`, `fetchVerificationStats`, and `fetchVerificationLogForEvent`.
- Added `scripts/run-integrity-check.ts` standalone cron script supporting `--limit N` and `--source <sourceType>` flags. Runs with `npm run verify:integrity`.
- Built `/admin/verification` admin dashboard: stats bar (counts by status), filterable log table with click-to-expand rows (shows LLM reason, coord delta, ticket URL, error details), and a manual run panel with source/limit selectors and inline result summary.
- Implemented ref-based state tracking and programmatic popup removal flags in `/admin/events` Mapbox component (`MapPanel.tsx`) to prevent race conditions and support direct event-to-event flight transitions without forced zoom-outs.
- Updated the ingestion pipeline's `resolveLocationData()` in `src/lib/ingestion/location-validation.ts` to automatically detect generic or incomplete addresses (lacking street numbers or matching city centroids like "Brooklyn, NY") and fallback-geocode them using the venue name concatenated with the city.
- Created `sanitizeAddressForGeocoding` utility in `src/lib/utils/sanitizeAddress.ts` and integrated it in `geocodeVenueWithMapbox` to strip out secondary unit designations (such as "Floor", "Suite", "Apt") from queries before invoking Mapbox, resolving NYC/Manhattan centroid geocoding failures while maintaining the raw rich addresses in the database.
- Enhanced `resolveLocationData()` to discard generic fallback centroids (e.g., Payne/East NY, Generic NYC, Generic Brooklyn) and return `null` coordinates instead of writing incorrect coordinates to the database.
- Fixed a bug in `scripts/scrape-songkick.ts` that caused ingestion runtime errors when attempting to upsert skipped events (due to date validation failures).
- Expanded manual overrides in `scripts/seed-venues.ts` with coordinates for 25+ major NYC venues (e.g. Blue Note, Webster Hall, Le Poisson Rouge, Brooklyn Paramount) to completely bypass geocoding issues and prevent generic centroid mappings.
- Backfilled the existing database using `npm run db:seed-venues` and `npm run db:sync-events`, successfully reducing the count of events mapped to generic centroids from **78** to **0**.

Phase 3 — Refactoring, Rate Limiting, Multi-City, and SeatGeek (completed 2026-05-30):
- **Unified Geocoding**: Created a central Mapbox geocoder utility (`src/lib/utils/geocode.ts`) and removed redundant geocoding code from the ingestion pipeline, NYC Parks client, and event verification service.
- **B2B API Rate Limit Auto-Reset**: Modified database schema to add `lastResetAt` timestamp and converted API key call counters to integers. Updated `apiKeyService.ts` to automatically reset counters daily, created a manual reset script (`scripts/reset-api-key-counters.ts`), and registered `reset:api-counters` npm script.
- **SeatGeek API & UI Integration**: Built a complete SeatGeek client (`src/lib/seatgeek/client.ts`) supporting pagination, taxonomy mapping, ingestion-level deduplication, and automated syncing (`scripts/sync-seatgeek.ts` + `sync:seatgeek` npm command). Also fully integrated SeatGeek into the Admin Events and Verification dashboards (adding SeatGeek options to dropdown selectors, metric color coding, table rows, and Mapbox map markers).
- **Multi-City Foundation**: Introduced `src/lib/utils/cityConfig.ts` defining boundaries, timezones, and configurations for different cities (starting with NYC), allowing validation and bounding-box calculations to dynamically support multi-city expansion.
- **Unified Utilities & DRY Refactoring**:
  - Created shared venue matching engine (`src/lib/utils/venueMatching.ts`) using Jaccard Similarity and string tokenization to replace duplicate similarity logic.
  - Raised the Jaccard threshold from 0.4 to 0.55 in `deduplicateAtIngestion.ts` to improve matching precision.
  - Created shared distance calculations (`src/lib/utils/calculateDistance.ts`) and shared Gemini API initialization (`src/lib/utils/gemini.ts`).
  - Created centralized ingestion tracking service (`src/lib/db/ingestionService.ts`).
- **Ticketmaster Scalability**: Enhanced Ticketmaster client to query and paginate up to 2,000 events (200 events/page × 10 pages) per sync, resolving the previous hard cap of 50 events.
- **Data Integrity Improvements**:
  - Decoupled verification checks in `verifyEventIntegrity.ts` so coordinate verification runs on all scrapeable/non-scrapeable sources.
  - Improved `isGenericAddress` logic in location validation to ignore false positives by checking ZIP codes and street suffixes.
  - Removed outdated NYC Parks historical fallback sync logic to keep data fresh.
- **Ops & Docker Multi-Stage Build**: Redesigned `/Dockerfile` to use a multi-stage layout, separating the lightweight runtime server (`node:20-slim`) from the heavy scraper dependencies (`playwright:v1.60.0-jammy`), reducing overall image size and surface area.
- **Codebase Sanitization**: Renamed application package name to `whim` and deleted five unused scratch scripts (`test-jones-beach.ts`, `test-superior-ingredients.ts`, `scratch-mapbox.ts`, `check-venues.ts`, `test_neon.ts`).
- **Unified Ingestion Script**: Replaced the shell script `sync-all.sh` with a cross-platform TypeScript orchestrator (`scripts/sync-all.ts` + `sync:all` npm command) that runs all scrapers, sync jobs, enrichment, and cleanup sequentially.
- **Mapbox Clustering Optimization**: Adjusted Mapbox GL JS clustering parameters in `MapPanel.tsx` (`clusterMaxZoom` to 12, and `clusterRadius` to 30) so that clustered events break out into individual markers sooner.

Phase 4 — Venue Portal & Direct Submission Slice (completed 2026-06-01):
- **Database Schema & Service Integration**: Added `'direct_submission'` source type to the Postgres `source_type` pgEnum and applied the migration to Neon. Implemented the `insertDraftEvent` database service function to persist submissions as drafts, storing submitter email and metadata inside `rawSource`. Added `publishDraftEvent` service function to set status from `'draft'` to `'active'`.
- **Validation**: Defined strict Zod validation schema `VenueSubmissionSchema` in `src/types/submission.ts` to enforce payload requirements.
- **API routes**:
  - Built the Next.js API route handler at `/api/v1/submit-event` that validates payloads, geocodes addresses using the central Mapbox geocoder, and saves the draft event.
  - Built the secure Next.js API route handler at `/api/v1/admin/events/[id]/publish` that transitions draft events to active.
- **Proxy Rate Limiting & Auth**: Added public client IP rate limiting (5 submissions per 10 minutes) for `/api/v1/submit-event` within `src/proxy.ts` (Next.js 16 custom middleware). Secured `/api/v1/admin/*` paths to require active B2B API keys of `pro` or `admin` tier without incrementing client rate limits.
- **Submission & Admin UI**:
  - Built a premium, stateful glassmorphic event submission client form (`EventSubmissionForm.tsx`) and layout wrapper at `/submit` with transition states, inline field errors, and a clean checkmark success view.
  - Updated the Admin Events dashboard to support both Active and Pending Submissions filtering (with SQL queries modified in `actions.ts`). Added an Action column and "Approve" button to `EventsTable.tsx` to publish drafts with optimistic UI updates. Custom green coloring and `SUB` formatting applied to direct submissions on the table and Mapbox panel.

Next up: Remaining venue portal features (claim listing, view analytics). Add Meetup.com and NYC.gov ingestion for further event type coverage. Deploy integrity check and syncs as Railway crons.

Phase 5 — Data Pipeline Improvements & Coverage Expansion (completed 2026-06-01):
- **Removed SeatGeek mock data fallback**: When `SEATGEEK_CLIENT_ID` is absent, `ingestSeatGeekEvents()` now returns `{ inserted: 0 }` and logs a warning rather than injecting two hardcoded fake events into the database. The dead `ingestMockSeatGeekData()` function was also removed from `src/lib/seatgeek/client.ts`.
- **Eventbrite city-wide search**: Rewrote `src/lib/eventbrite/client.ts` to use the `/events/search/` endpoint with `location.latitude/longitude` + `location.within=30km` instead of the previous per-organizer/venue config approach. This unlocks all public live events in NYC — community events, art gallery openings, book readings, food/drink events, comedy shows, workshops, fitness classes, and film screenings — without requiring any pre-registration. Paginated up to 5 pages × 50 events. The `src/lib/ingestion/eventbrite.ts` runner was simplified to delegate directly to the new client. Skips `online_event=true` rows (no geocodable venue). Fixed `src/app/api/ingest/eventbrite/route.ts` to match the new single-argument signature.
- **Resident Advisor scraper v1** (`scripts/scrape-ra.ts`): Playwright DOM scraper with date parsing from `data-pw-date` headers, unified geocoding, title normalization, category classification, cross-platform dedup, and ingestion tracking. (Superseded in Phase 7 by GraphQL rewrite.)

Phase 6 — iCal Ingestion & Ticket Price Normalization (completed 2026-06-01):
- **iCal Feed Ingestion Pipeline**:
  - Built a robust iCal parser (`src/lib/ical/client.ts`) utilizing `node-ical` to fetch remote `.ics` URLs, validate content header/body to reject HTML pages, normalize `VEVENT` data to the Whim schema, and resolve recurrence rules by expanding instances over a rolling 60-day window.
  - Implemented the database integration worker (`src/lib/ical/ingest.ts`) supporting ingestion-level deduplication and updating `ingestion_sources` sync status.
  - Added standalone runner script `scripts/sync-ical.ts` supporting `--url` for ad-hoc feeds, and seed script `scripts/seed-ical-sources.ts` which seeds the City Parks Foundation feed (`https://www.cityparksfoundation.org/events/?ical=1`).
  - Added `sync:ical` and `seed:ical-sources` npm scripts.
  - Updated `scripts/sync-all.ts` orchestrator to run iCal syncing.
- **Eventbrite Ticket Price Extraction & Backfill**:
  - Updated the Eventbrite client (`src/lib/eventbrite/client.ts`) to extract minimum and maximum ticket prices using Expanded `ticket_availability` fields (`minimum_ticket_price.major_value` / `maximum_ticket_price.major_value`).
  - Added a backfill script (`scripts/backfill-eventbrite-prices.ts` + `npm run backfill:eb-prices`) which updated 448 Eventbrite events in the database with accurate price ranges and `isFree` statuses.
- **Ticketmaster Price API Enhancement**:
  - Appended `&expand=priceRanges` to Ticketmaster API search requests to fetch and persist accurate prices for commercial events.
- **Development Tooling & Scripts**:
  - Fixed a TypeScript compilation issue in `tsconfig.scripts.json` by adding `"moduleResolution": "node"` to prevent CommonJS import resolution failures for build/seed scripts.

Phase 7 — Scraper Reliability, Description Capture & Data Quality Audit (completed 2026-06-02):
- **RA GraphQL Rewrite**: Completely rewrote `scripts/scrape-ra.ts` to use RA's undocumented GraphQL API (`https://ra.co/graphql`) instead of Playwright DOM scraping. The previous scraper was blocked by DataDome CAPTCHA (0 events extracted). The GraphQL approach requires no browser, returns structured data (titles, dates, start/end times, venue addresses, images), and ingested **280 new NYC events** on first run. NYC area ID = 8. Paginates up to 6 pages × 50 events = 300 events/sync. Confidence score raised to 0.85 (structured API vs 0.6 for DOM scraping). Cross-platform dedup successfully merged 13 events already in the DB from Dice/Songkick.
- **Dice & Songkick Description Capture**: Both scrapers already fetched detail pages for JSON-LD coordinate extraction. Extended them to also extract event descriptions from JSON-LD `Event.description`/`MusicEvent.description` fields, with a fallback to `<meta name="description">` tags. Added `description` field to `RawSongkickEvent` interface. `normalizeSongkickEvent` now prefers scraped descriptions over the generic `"Featuring: artist1, artist2"` strings. Dice's `eventToInsert` now includes the extracted `eventDescription`.
- **Eventbrite API Deprecation Handling**: The Eventbrite `/events/search/` endpoint (deprecated Dec 2019) now returns 404 permanently. Updated `src/lib/eventbrite/client.ts` to detect 404 errors and break gracefully with a clear warning instead of crashing `sync:all`. Existing Eventbrite events remain in the database from prior syncs.
- **Playwright Browser Install**: Resolved `chromium_headless_shell` missing errors by running `npx playwright install` to download updated browser binaries for Dice, Songkick, and RA scrapers.
- **Audit Script Fix**: Fixed `scripts/audit-data-quality.ts` — added `dotenv.config()` before DB imports so `DATABASE_URL` is available when the Neon HTTP client initializes. Without this, the script always failed with `fetch failed` / `AggregateError`.
- **Data Quality Audit Dashboard**: Built 6-tab admin dashboard (`DataQualityDashboard.tsx`) at `/admin/verification` with Overview, Stale Events, Data Completeness, Coordinate Audit, Duplicate Detection, and Verification Logs tabs. Includes batch audit engine (`auditEventQuality.ts`), DB queries (`auditQueries.ts`), and CLI script (`audit-data-quality.ts` with `--limit`, `--fix-stale`, `--dry-run`, `--source` flags).
- **Backfill Infrastructure**: Created `scripts/backfill-descriptions.ts` with confidence scoring, scraping logic, and dry-run capabilities for post-ingestion description backfilling (limited by source bot-blocking on TM/Songkick).
- **Source Status**:
  - ✅ Ticketmaster: 1200 events/sync, paginated up to API limit
  - ✅ Songkick: 148 events/sync, now with descriptions
  - ✅ Dice: 30 events/sync, now with descriptions
  - ✅ RA: 280 events/sync via GraphQL (no CAPTCHA issues)
  - ✅ iCal/City Parks Foundation: 30 events
  - ✅ Bandsintown enrichment: backfills missing images
  - ⚠️ Eventbrite: `/events/search/` permanently deprecated (404). Needs Playwright scraper rewrite.
  - ⚠️ NYC Parks Socrata: Dataset `fudw-fgrp` stale since 2019. No new data available.
  - ⚠️ SeatGeek: No `SEATGEEK_CLIENT_ID` configured.
  - ⚠️ Rough Trade iCal: Dead URL (404). Events covered by Dice scraper.

Next up: Build Eventbrite Playwright scraper to replace dead API. Implement iCal ingestion for Brooklyn Music Kitchen and similar WordPress venues. Add dedup check to direct submission flow to prevent duplicates. Explore RA GraphQL for event descriptions.

## What is NOT in scope yet

- Eventbrite Playwright scraper (to replace deprecated API)
- Venue portal (claim listing, submit events, view analytics)
- Email parsing pipeline (LLM-based, for long-tail venues)
- Meetup.com API integration (community events, run clubs, book clubs, workshops)
- NYC.gov Events Calendar ingestion
- Friend coordination / social layer
- Multi-city expansion (fully threading CityConfig through all ingestors and API endpoints)
- Payment/billing infrastructure

## Key design decisions (from initial planning)

- rawSource (jsonb) stored on every event for reprocessing if schema evolves
- confidenceScore lets LLM-parsed events rank lower than API-sourced events until verified
- recurrenceRule uses RFC 5545 RRULE format; expand with rrule.js at query time
- For MVP, lat/lng with bounding-box filter is sufficient; PostGIS ST_DWithin can replace later
- The email parser is proven separately before integrating (10 email types stress test with defined output schema)
- Demand validation runs in parallel: 3-5 conversations with potential B2B customers about how they currently get event data

