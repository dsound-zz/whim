/**
 * verifyEventIntegrity.ts
 *
 * Core smoke-test service. Given a single EventData record, runs two checks:
 *
 *  1. Content check — fetches the event's ticketUrl and asks Gemini (JSON mode)
 *     whether the page confirms the event's title, date, and venue are still live.
 *
 *  2. Coordinate check — re-geocodes the event's venue address via the Mapbox
 *     Geocoding API and computes the Haversine distance in meters between the
 *     stored coordinates and the freshly-returned ones. Flags if > 500 m apart.
 *
 * Returns a VerificationResult that maps 1:1 to the event_verification_logs row.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type {
  EventData,
  LlmEvaluationResponse,
  MapboxGeocodeResult,
  VerificationResult,
  VerificationStatus,
} from '@/types/verification';
import { updateEventStatus } from '@/lib/db/eventService';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { calculateDistanceMeters } from '@/lib/utils/calculateDistance';
import { venueOverrides } from '@/lib/utils/venueOverrides';
import { fetchPageHtml, stripHtmlTags } from '@/lib/utils/fetchPageText';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of characters of page text we feed to the LLM. */
const MAX_PAGE_TEXT_CHARS = 8_000;

/** Maximum characters stored in pageTextSnippet for debugging. */
const MAX_SNIPPET_CHARS = 5_000;

/** Flag if stored coords differ from Mapbox re-geocode by more than this. */
const COORD_DELTA_FLAG_THRESHOLD_METERS = 500;

/**
 * Domains we cannot fetch with a plain HTTP request:
 *  - dice.fm        — requires JS rendering
 *  - ticketmaster.com — requires authentication (returns 401)
 *  - songkick.com   — aggressively bot-blocks plain fetches (returns 406)
 *
 * Events from these domains get llmConfirmed=null (skipped) rather than
 * erroring, since the page block tells us nothing about the event's validity.
 * The coordinate check still runs for them.
 */
const SCRAPE_BLOCKED_DOMAINS = ['dice.fm', 'ticketmaster.com', 'songkick.com'];

// ─── Public API ───────────────────────────────────────────────────────────────

export async function verifyEventIntegrity(
  event: EventData
): Promise<VerificationResult> {
  try {
    // Run content check first
    const contentCheckOutput = await runContentCheck(event);

    let coordCheckOutput: CoordCheckOutput;
    let coordError: string | null = null;

    // Always run coordinate check independently of content check outcome.
    // Previously the coord check was bypassed when content was skipped,
    // meaning events from dice/TM/songkick never got coordinates verified.
    try {
      coordCheckOutput = await runCoordinateCheck(event);
    } catch (err) {
      coordError = String(err);
      coordCheckOutput = {
        isSkipped: true,
        mapboxLat: null,
        mapboxLng: null,
        deltaMeters: null,
        isMismatch: false,
      };
    }

    const resolvedStatus = resolveVerificationStatus({
      llmConfirmed: contentCheckOutput.llmConfirmed,
      isContentCheckSkipped: contentCheckOutput.isSkipped,
      isCoordMismatch: coordCheckOutput.isMismatch,
      isCoordCheckSkipped: coordCheckOutput.isSkipped,
      hasError: !!coordError,
    });

    const mismatchReasonParts: string[] = [];

    if (contentCheckOutput.llmConfirmed === false) {
      mismatchReasonParts.push(
        `Content: ${contentCheckOutput.llmReason ?? 'LLM could not confirm event'}`
      );
      try {
        await updateEventStatus(event.id, 'expired');
      } catch (dbError) {
        console.error(`[verifyEventIntegrity] Failed to mark soft 404 event ${event.id} as expired:`, dbError);
      }
    }

    if (coordCheckOutput.isMismatch && coordCheckOutput.deltaMeters !== null) {
      mismatchReasonParts.push(
        `Coordinates: stored coords are ${Math.round(coordCheckOutput.deltaMeters)}m from Mapbox re-geocode`
      );
    }

    const errorParts: string[] = [];
    if (coordError) errorParts.push(`Coord check error: ${coordError}`);

    return {
      eventId: event.id,
      status: resolvedStatus,

      pageTextSnippet: contentCheckOutput?.pageTextSnippet ?? null,
      llmConfirmed: contentCheckOutput?.llmConfirmed ?? null,
      llmReason: contentCheckOutput?.llmReason ?? null,

      storedLat: event.lat,
      storedLng: event.lng,
      mapboxLat: coordCheckOutput?.mapboxLat ?? null,
      mapboxLng: coordCheckOutput?.mapboxLng ?? null,
      coordDeltaMeters: coordCheckOutput?.deltaMeters ?? null,

      mismatchReason:
        mismatchReasonParts.length > 0 ? mismatchReasonParts.join(' | ') : null,
      errorMessage: errorParts.length > 0 ? errorParts.join(' | ') : null,
    };
  } catch (fatalError) {
    // If the orchestrator itself throws, return a well-formed error result.
    return {
      eventId: event.id,
      status: 'error',
      pageTextSnippet: null,
      llmConfirmed: null,
      llmReason: null,
      storedLat: event.lat,
      storedLng: event.lng,
      mapboxLat: null,
      mapboxLng: null,
      coordDeltaMeters: null,
      mismatchReason: null,
      errorMessage: `Fatal error in verifyEventIntegrity: ${String(fatalError)}`,
    };
  }
}

// ─── Content Check ────────────────────────────────────────────────────────────

interface ContentCheckOutput {
  isSkipped: boolean;
  pageTextSnippet: string | null;
  llmConfirmed: boolean | null;
  llmReason: string | null;
}

async function runContentCheck(event: EventData): Promise<ContentCheckOutput> {
  if (!event.ticketUrl) {
    return {
      isSkipped: true,
      pageTextSnippet: null,
      llmConfirmed: null,
      llmReason: null,
    };
  }

  // Skip domains that block plain HTTP fetches — either JS-rendered, auth-gated,
  // or aggressively bot-blocked. Mark as skipped rather than erroring so the
  // coordinate check result can still surface cleanly.
  const isScrapingBlocked = SCRAPE_BLOCKED_DOMAINS.some((domain) =>
    event.ticketUrl!.includes(domain)
  );

  if (isScrapingBlocked) {
    return {
      isSkipped: true,
      pageTextSnippet: null,
      llmConfirmed: null,
      llmReason: `Skipped: ${event.ticketUrl} is not scrapeable (JS-rendered, auth-gated, or bot-blocked)`,
    };
  }

  let rawHtml: string;
  try {
    rawHtml = await fetchPageHtml(event.ticketUrl);
  } catch (fetchError: any) {
    const message = fetchError?.message || String(fetchError);
    if (message.includes('HTTP 404')) {
      // Graceful 404 Handling for Stale Events
      try {
        await updateEventStatus(event.id, 'expired');
      } catch (dbError) {
        console.error(`[verifyEventIntegrity] Failed to mark event ${event.id} as expired:`, dbError);
      }
      return {
        isSkipped: true,
        pageTextSnippet: 'HTTP 404 Not Found',
        llmConfirmed: null,
        llmReason: `Skipped: Event page returned 404 (event marked as expired)`,
      };
    }

    // For other fetch/scraping errors (like 403, 406, timeout), treat as skipped/un-scrapeable
    return {
      isSkipped: true,
      pageTextSnippet: null,
      llmConfirmed: null,
      llmReason: `Skipped: Page is un-scrapeable due to fetch error: ${message}`,
    };
  }

  const pageText = stripHtmlTags(rawHtml).slice(0, MAX_PAGE_TEXT_CHARS);
  const pageTextSnippet = pageText.slice(0, MAX_SNIPPET_CHARS);

  // Pre-LLM cancellation scan: detect explicit cancellation language before
  // spending a Gemini call. If the page clearly says the event is cancelled we
  // can short-circuit with llmConfirmed=false immediately.
  const cancellationDetection = detectExplicitCancellation(pageText, event.title);
  if (cancellationDetection.isCancelled) {
    return {
      isSkipped: false,
      pageTextSnippet,
      llmConfirmed: false,
      llmReason: cancellationDetection.reason,
    };
  }

  let llmResult: LlmEvaluationResponse;
  try {
    llmResult = await evaluatePageWithLlm({
      pageText,
      eventTitle: event.title,
      eventStartAt: event.startAt,
      eventVenueName: event.venueName,
    });
  } catch (llmError: any) {
    console.error(`[verifyEventIntegrity] LLM Evaluation failed for event ${event.id}:`, llmError);
    return {
      isSkipped: true,
      pageTextSnippet,
      llmConfirmed: null,
      llmReason: `Skipped: LLM evaluation error (${llmError.message || String(llmError)})`,
    };
  }

  return {
    isSkipped: false,
    pageTextSnippet,
    llmConfirmed: llmResult.confirmed,
    llmReason: llmResult.reason,
  };
}

// ─── Coordinate Check ─────────────────────────────────────────────────────────

interface CoordCheckOutput {
  isSkipped: boolean;
  mapboxLat: number | null;
  mapboxLng: number | null;
  deltaMeters: number | null;
  isMismatch: boolean;
}

async function runCoordinateCheck(event: EventData): Promise<CoordCheckOutput> {
  if (!event.lat || !event.lng || !event.address) {
    return {
      isSkipped: true,
      mapboxLat: null,
      mapboxLng: null,
      deltaMeters: null,
      isMismatch: false,
    };
  }

  const override = venueOverrides.find(
    (v) => v.name.toLowerCase() === (event.venueName ?? '').toLowerCase()
  );

  if (override) {
    const deltaMeters = calculateDistanceMeters(
      event.lat,
      event.lng,
      override.lat,
      override.lng
    );

    return {
      isSkipped: false,
      mapboxLat: override.lat,
      mapboxLng: override.lng,
      deltaMeters,
      isMismatch: deltaMeters > COORD_DELTA_FLAG_THRESHOLD_METERS,
    };
  }

  const searchQuery = [event.venueName, event.address]
    .filter(Boolean)
    .join(', ');

  // Use the shared geocoder with types filter for higher precision in verification
  const mapboxResult = await geocodeWithMapbox(
    event.venueName ?? 'Unknown Venue',
    searchQuery,
    { skipVenueDbLookup: true, types: 'poi,address' }
  );

  if (!mapboxResult) {
    return {
      isSkipped: true,
      mapboxLat: null,
      mapboxLng: null,
      deltaMeters: null,
      isMismatch: false,
    };
  }

  const deltaMeters = calculateDistanceMeters(
    event.lat,
    event.lng,
    mapboxResult.lat,
    mapboxResult.lng
  );

  return {
    isSkipped: false,
    mapboxLat: mapboxResult.lat,
    mapboxLng: mapboxResult.lng,
    deltaMeters,
    isMismatch: deltaMeters > COORD_DELTA_FLAG_THRESHOLD_METERS,
  };
}

// ─── Status Resolution ────────────────────────────────────────────────────────

interface StatusResolutionInput {
  llmConfirmed: boolean | null;
  isContentCheckSkipped: boolean;
  isCoordMismatch: boolean;
  isCoordCheckSkipped: boolean;
  hasError: boolean;
}

function resolveVerificationStatus(input: StatusResolutionInput): VerificationStatus {
  if (input.hasError) return 'error';

  const isContentBad = input.llmConfirmed === false;
  const isCoordBad = input.isCoordMismatch;

  if (isContentBad && isCoordBad) return 'flagged_both';
  if (isContentBad) return 'flagged_content';
  if (isCoordBad) return 'flagged_coordinates';

  // If the content check was skipped (bot-blocked, auth-gated, or no URL),
  // we have no confirmation the event is live — do not call it 'verified'
  // even if coordinates look correct.
  if (input.isContentCheckSkipped) return 'skipped';

  return 'verified';
}

// ─── Cancellation Detection ───────────────────────────────────────────────────

interface CancellationDetectionResult {
  isCancelled: boolean;
  reason: string | null;
}

/**
 * Scans stripped page text for explicit cancellation language before calling
 * the LLM. This avoids spending a Gemini call on events the page already
 * clearly marks as cancelled (e.g. Eventbrite's "Cancelled Mon, Jun 8 • 8 PM").
 *
 * Patterns are intentionally specific to avoid false positives — e.g. a page
 * about a "Cancel your reservation" button should not trigger this.
 */
function detectExplicitCancellation(
  pageText: string,
  eventTitle: string
): CancellationDetectionResult {
  const CANCELLATION_PATTERNS: RegExp[] = [
    // Eventbrite: "Cancelled Mon, Jun 8 • 8 PM" or "Cancelled Tuesday, June 10"
    /\bCancelled\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
    // Generic: "This event has been cancelled"
    /\bThis\s+event\s+has\s+been\s+cancelled\b/i,
    // Generic: "Event cancelled" as a standalone phrase
    /\bEvent\s+cancelled\b/i,
    // Ticketmaster-style: "This event has been canceled"
    /\bThis\s+event\s+has\s+been\s+canceled\b/i,
    // City Parks Foundation / NYC Parks style
    /\bThis\s+program\s+has\s+been\s+cancell?ed\b/i,
  ];

  for (const pattern of CANCELLATION_PATTERNS) {
    if (pattern.test(pageText)) {
      return {
        isCancelled: true,
        reason: `Page contains explicit cancellation language for "${eventTitle}".`,
      };
    }
  }

  return { isCancelled: false, reason: null };
}

// ─── LLM Evaluation ──────────────────────────────────────────────────────────

interface LlmEvaluationInput {
  pageText: string;
  eventTitle: string;
  eventStartAt: Date;
  eventVenueName: string | null;
}

async function evaluatePageWithLlm(
  input: LlmEvaluationInput
): Promise<LlmEvaluationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set — cannot run LLM content check');
  }

  const formattedDate = input.eventStartAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are an event data integrity verifier. Your job is to determine whether a webpage confirms that a specific event is still scheduled.

You will receive:
- Event title
- Expected date
- Expected venue name (may be null)
- The raw text content of the event page

Respond ONLY with valid JSON matching this exact schema:
{"confirmed": boolean, "reason": string}

Rules for setting "confirmed":
- true: The page clearly shows the event is scheduled. This includes:
  * The specific expected date appears on the page alongside the event title/venue.
  * The page describes the event as recurring (e.g. "every Monday", "every other week", "1st/3rd Wednesdays", "Multiple dates", "weekly", "nightly") AND the title and venue match — a recurring event on the correct day-of-week is considered confirmed even if the exact date is not printed.
  * The event is a multi-week series (e.g. "6-week class") that started before the expected date and is still running.
- false: The page shows the event is cancelled, the date is explicitly wrong (a different non-recurring date is listed), the event is not mentioned at all, or the page is a generic error/404.

- "reason": a single concise sentence explaining your verdict.`;

  const userPrompt = `Event to verify:
- Title: ${input.eventTitle}
- Expected date: ${formattedDate}
- Expected venue: ${input.eventVenueName ?? '(not specified)'}

Page text (truncated to ${MAX_PAGE_TEXT_CHARS} chars):
---
${input.pageText}
---

Does this page confirm the event is live?`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          confirmed: { type: SchemaType.BOOLEAN },
          reason: { type: SchemaType.STRING },
        },
        required: ['confirmed', 'reason'],
      },
      temperature: 0.0,
      maxOutputTokens: 1024,
    },
  });

  const result = await model.generateContent(userPrompt);
  const rawText = result.response.text();

  let cleanText = rawText.trim();
  cleanText = cleanText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed: LlmEvaluationResponse;
  try {
    parsed = JSON.parse(cleanText) as LlmEvaluationResponse;
  } catch (err: any) {
    throw new Error(`LLM returned invalid JSON. Raw text: ${rawText}`);
  }

  if (typeof parsed.confirmed !== 'boolean' || typeof parsed.reason !== 'string') {
    throw new Error(`Unexpected LLM JSON shape: ${cleanText}`);
  }

  return parsed;
}


