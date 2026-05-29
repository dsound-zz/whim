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

    // Bypass coordinate check if content check was skipped or un-scrapeable
    if (contentCheckOutput.isSkipped) {
      coordCheckOutput = {
        isSkipped: true,
        mapboxLat: null,
        mapboxLng: null,
        deltaMeters: null,
        isMismatch: false,
      };
    } else {
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

  const llmResult = await evaluatePageWithLlm({
    pageText,
    eventTitle: event.title,
    eventStartAt: event.startAt,
    eventVenueName: event.venueName,
  });

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

  const searchQuery = [event.venueName, event.address]
    .filter(Boolean)
    .join(', ');

  const mapboxResult = await geocodeWithMapbox(searchQuery);

  if (!mapboxResult) {
    return {
      isSkipped: true,
      mapboxLat: null,
      mapboxLng: null,
      deltaMeters: null,
      isMismatch: false,
    };
  }

  const deltaMeters = haversineDistanceMeters(
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

// ─── Page Fetching ────────────────────────────────────────────────────────────

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Mimic a real browser to avoid bot-blocking on event pages.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripHtmlTags(html: string): string {
  // Remove <script> and <style> blocks entirely (they add noise, no signal).
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Strip all remaining HTML tags.
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Collapse whitespace.
  return cleaned.replace(/\s+/g, ' ').trim();
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

- "confirmed": true if the page content clearly indicates the event is scheduled on the expected date at the expected venue. false if the event appears cancelled, the date is wrong, the event is not mentioned, or the page is an error/404.
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

  const parsed = JSON.parse(rawText) as LlmEvaluationResponse;

  if (typeof parsed.confirmed !== 'boolean' || typeof parsed.reason !== 'string') {
    throw new Error(`Unexpected LLM JSON shape: ${rawText}`);
  }

  return parsed;
}

// ─── Mapbox Geocoding ─────────────────────────────────────────────────────────

async function geocodeWithMapbox(
  searchQuery: string
): Promise<MapboxGeocodeResult | null> {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is not set — cannot run coordinate check');
  }

  // Restrict results to the NYC metropolitan area bounding box to avoid
  // returning a venue in another city with the same name.
  const nycBoundingBox = '-74.2591,40.4774,-73.7002,40.9176';

  const encodedQuery = encodeURIComponent(searchQuery);
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json` +
    `?access_token=${mapboxToken}` +
    `&bbox=${nycBoundingBox}` +
    `&limit=1` +
    `&types=poi,address`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox geocoding error ${response.status} for query: "${searchQuery}"`);
  }

  const data = await response.json();
  const firstFeature = data?.features?.[0];

  if (!firstFeature) return null;

  const [lng, lat] = firstFeature.geometry.coordinates as [number, number];

  return {
    lat,
    lng,
    placeName: firstFeature.place_name as string,
  };
}

// ─── Haversine (meters) ───────────────────────────────────────────────────────

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_METERS = 6_371_000;

  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(a));
}
