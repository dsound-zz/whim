/**
 * Ingestion worker for LLM-extracted venue events.
 *
 * For each curated venue target: resolve the venue once via the registry
 * (canonical venueId + coordinates), fetch + LLM-extract its events page once,
 * then normalize/dedup/upsert each extracted event through the same pipeline
 * every other source uses.
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { extractVenueEventsFromPage, type ExtractedRawEvent } from './extractVenueEvents';
import { LLM_EXTRACTION_VENUE_TARGETS, type LlmExtractionVenueTarget } from './venueTargets';
import { resolveVenueSafely } from '@/lib/db/venueService';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { normalizeForComparison } from '@/lib/utils/venueMatching';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { estimateEndTime } from '@/lib/utils/estimateEndTime';
import { updateIngestionSourceStatus } from '@/lib/db/ingestionService';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

export interface LlmExtractionResult {
  venuesProcessed: number;
  venuesErrored: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Builds a Date from a "YYYY-MM-DD" + "HH:mm" NYC wall-clock pair.
 *
 * Deliberately uses Date.UTC rather than the local Date constructor + setHours.
 * The `events.start_at` column is "timestamp without time zone" — Postgres
 * stores whatever clock digits it's given, with no zone conversion. But the
 * driver serializes JS Date objects via toISOString(), which renders UTC
 * digits. If this process's local timezone is NOT UTC (e.g. it's
 * America/New_York, as it is by default in this environment), a Date built
 * with the local constructor holds the right wall-clock time but the wrong
 * UTC digits, so toISOString() — and therefore what lands in the DB — is
 * off by the zone offset (4-5 hours). Building with Date.UTC sets the UTC
 * digits directly to the intended NYC wall-clock numbers, so what's stored
 * matches the page exactly regardless of the running process's local TZ.
 */
function buildLocalDate(dateIso: string, time: string | null): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
}

/**
 * Builds startAt/endAt for a raw extracted event. The LLM is told "date" is
 * always the event's START date, even for sets that run past midnight (e.g.
 * "9:00 PM - 12:00 AM"). So when endTime's clock hour is earlier than
 * startTime's, the end genuinely falls on the next calendar day — roll it
 * forward rather than let it (incorrectly) land before the start.
 */
function buildEventTimes(raw: ExtractedRawEvent): { startAt: Date; endAt: Date | null } {
  const startAt = buildLocalDate(raw.date, raw.startTime);
  if (!raw.endTime) return { startAt, endAt: null };

  let endAt = buildLocalDate(raw.date, raw.endTime);
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startAt, endAt };
}

/** Stable synthetic externalId: no platform ID exists for a venue's own page. */
function buildExternalId(venueName: string, event: ExtractedRawEvent): string {
  const venueSlug = normalizeForComparison(venueName);
  const titleSlug = normalizeForComparison(event.title).slice(0, 40);
  return `llm_${venueSlug}_${event.date}_${titleSlug}`;
}

async function ingestVenue(
  target: LlmExtractionVenueTarget,
  results: LlmExtractionResult
): Promise<void> {
  const resolvedVenue = await resolveVenueSafely({
    name: target.name,
    address: target.address,
    lat: null,
    lng: null,
    sourceType: 'llm_extraction',
  });

  const rawEvents = await extractVenueEventsFromPage({
    venueName: target.name,
    eventsPageUrl: target.eventsPageUrl,
  });

  console.log(`[LLM Extraction] ${target.name}: extracted ${rawEvents.length} raw event(s).`);

  for (const raw of rawEvents) {
    try {
      const { startAt, endAt } = buildEventTimes(raw);

      const dateValidation = validateEventDates(startAt, endAt);
      if (!dateValidation.isValid) {
        console.warn(`[LLM Extraction] Skipping "${raw.title}" (${target.name}): ${dateValidation.rejectionReason}`);
        results.skipped++;
        continue;
      }

      const normalizedTitle = normalizeEventTitle(raw.title) ?? raw.title;
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: raw.description,
        skipLlmFallback: true,
        defaultCategory: target.defaultCategory,
      });

      const externalId = buildExternalId(target.name, raw);

      const eventToInsert = {
        externalId,
        sourceType: 'llm_extraction' as const,
        title: normalizedTitle,
        description: raw.description,
        category,
        imageUrl: null as string | null,
        startAt,
        endAt: dateValidation.sanitizedEndAt ?? estimateEndTime(startAt, category),
        venueId: resolvedVenue?.venueId ?? null,
        venueName: target.name,
        address: target.address,
        lat: resolvedVenue?.lat ?? null,
        lng: resolvedVenue?.lng ?? null,
        isFree: raw.isFree,
        priceMin: raw.priceMin,
        priceMax: raw.priceMax,
        currency: 'USD',
        ticketUrl: target.eventsPageUrl,
        platform: target.name,
        // Lower trust than any structured API/scraper: LLM-inferred from free text,
        // unverified until the integrity checker confirms it.
        confidenceScore: 0.45,
        rawSource: { extracted: raw, eventsPageUrl: target.eventsPageUrl },
        status: 'active' as const,
      };

      const dedupCandidate: IncomingEventForDedup = {
        externalId: eventToInsert.externalId,
        sourceType: eventToInsert.sourceType,
        title: eventToInsert.title,
        venueId: eventToInsert.venueId,
        venueName: eventToInsert.venueName,
        lat: eventToInsert.lat,
        lng: eventToInsert.lng,
        startAt: eventToInsert.startAt,
        ticketUrl: eventToInsert.ticketUrl,
        platform: eventToInsert.platform,
        priceMin: eventToInsert.priceMin,
        priceMax: eventToInsert.priceMax,
        isFree: eventToInsert.isFree,
      };

      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.externalId, externalId), eq(events.sourceType, 'llm_extraction')))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(events)
          .set({ ...eventToInsert, ticketUrls: buildInitialTicketUrls(dedupCandidate) })
          .where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        const dedupResult = await findCanonicalMatch(dedupCandidate);
        if (dedupResult.isMatch && dedupResult.canonicalEventId) {
          const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
          await mergeIntoCanonical(
            dedupResult.canonicalEventId,
            dedupCandidate,
            coreFields,
            dedupResult.shouldUpdateCanonical
          );
          results.skipped++;
        } else {
          await db.insert(events).values({ ...eventToInsert, ticketUrls: buildInitialTicketUrls(dedupCandidate) });
          results.inserted++;
        }
      }
    } catch (error) {
      console.error(`[LLM Extraction] Failed to process event "${raw.title}" (${target.name}):`, error);
      results.errors++;
    }
  }
}

export async function runLlmExtractionIngestion(
  targets: LlmExtractionVenueTarget[] = LLM_EXTRACTION_VENUE_TARGETS
): Promise<LlmExtractionResult> {
  const results: LlmExtractionResult = {
    venuesProcessed: 0,
    venuesErrored: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const target of targets) {
    try {
      await ingestVenue(target, results);
      results.venuesProcessed++;
    } catch (error) {
      console.error(`[LLM Extraction] Failed to process venue "${target.name}":`, error);
      results.venuesErrored++;
    }
  }

  await updateIngestionSourceStatus(
    'llm_extraction',
    results.venuesErrored > 0 && results.venuesProcessed === 0 ? 'error' : 'active'
  );

  console.log(
    `[LLM Extraction] Done: venues=${results.venuesProcessed}/${targets.length}, ` +
    `inserted=${results.inserted}, updated=${results.updated}, skipped=${results.skipped}, errors=${results.errors}`
  );

  return results;
}
