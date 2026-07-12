/**
 * LLM-based event extraction from a venue's own events page.
 *
 * This is the long-tail source tier: venues like Ornithology Jazz Club sell no
 * tickets (donation-based, no-cover) and so are invisible to every platform API
 * and ticketed-concert scraper Whim has (Ticketmaster, Dice, Eventbrite,
 * Songkick, RA). Their events only exist on their own website. Instead of
 * writing a bespoke CSS-selector scraper per venue (fragile, breaks on every
 * redesign), this fetches the page as plain text and asks an LLM to extract
 * structured events — resilient to markup changes, at the cost of a per-page
 * model call.
 */

import { fetchPageText } from '@/lib/utils/fetchPageText';
import { callTogetherChat, extractJsonObject } from '@/lib/utils/together';

export interface ExtractedRawEvent {
  title: string;
  description: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, 24-hour. Null if the page gave no start time. */
  startTime: string | null;
  /** HH:mm, 24-hour. Null if the page gave no end time. */
  endTime: string | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
}

interface ExtractionResponseShape {
  events?: unknown;
}

const SYSTEM_INSTRUCTION = `You are a structured-data extraction engine. You are given the plain text of a venue's public events/calendar page. Extract every distinct scheduled event (show, performance, class, gathering) into JSON.

Rules:
- Output ONLY a JSON object of the shape {"events": [...]}. No prose, no markdown fences.
- Each event object must have: title (string), description (string or null — e.g. lineup/performer names), date ("YYYY-MM-DD"), startTime ("HH:mm" 24-hour or null), endTime ("HH:mm" 24-hour or null), isFree (boolean), priceMin (number or null), priceMax (number or null).
- Dates on the page usually omit the year. You are told today's date — infer the year: if the month/day has already passed relative to today, use next year; otherwise use this year. Preserve the page's own chronological order when resolving ambiguity.
- TIME FORMAT — read carefully: startTime/endTime must be the exact local wall-clock time printed on the page, only converted from 12-hour to 24-hour notation. Do NOT convert to UTC or any other timezone, and do NOT shift the clock forward or back for any reason — e.g. "6:30 PM" is exactly "18:30", not "22:30". The "date" field is always the calendar date the event STARTS on, even if the event runs past midnight — e.g. a set from "9:00 PM to 12:00 AM" on the page's "July 15th" gets date="2026-07-15", startTime="21:00", endTime="00:00" (the fact that 00:00 is chronologically the next day is expected and handled by the caller — do not change the date field to compensate).
- If the page states no cover charge, suggested donation, or doesn't mention a price, set isFree=true and priceMin/priceMax=null.
- If a price or price range is stated, set isFree=false and fill priceMin/priceMax (use the same value for both if only one price is given).
- Do NOT invent events that aren't clearly present in the text. If the page has no extractable events, return {"events": []}.
- Ignore navigation links, footer text, and anything that isn't a specific dated event.`;

function buildUserPrompt(params: { venueName: string; pageText: string; todayIso: string }): string {
  return `Venue name: ${params.venueName}
Today's date: ${params.todayIso}

Page text:
${params.pageText}`;
}

/**
 * Fetches a venue's events page and asks the LLM to extract structured events.
 * Throws on fetch failure or an unparseable LLM response — callers should
 * catch and treat the whole venue as skipped for this run rather than crash
 * the pipeline.
 */
export async function extractVenueEventsFromPage(params: {
  venueName: string;
  eventsPageUrl: string;
}): Promise<ExtractedRawEvent[]> {
  const pageText = await fetchPageText(params.eventsPageUrl, 8_000);
  if (!pageText || pageText.length < 50) {
    throw new Error(`Page text too short or empty (${pageText.length} chars) — likely JS-rendered or blocked`);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const userContent = buildUserPrompt({ venueName: params.venueName, pageText, todayIso });

  const { content } = await callTogetherChat({
    systemInstruction: SYSTEM_INSTRUCTION,
    userContent,
    temperature: 0,
  });

  let parsed: ExtractionResponseShape;
  try {
    parsed = extractJsonObject(content) as ExtractionResponseShape;
  } catch (error) {
    throw new Error(`Failed to parse LLM response as JSON: ${(error as Error).message}. Raw: ${content.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed.events)) {
    throw new Error(`LLM response missing "events" array. Raw: ${content.slice(0, 300)}`);
  }

  const validated: ExtractedRawEvent[] = [];
  for (const raw of parsed.events) {
    const validatedEvent = validateExtractedEvent(raw);
    if (validatedEvent) validated.push(validatedEvent);
  }

  return validated;
}

function validateExtractedEvent(raw: unknown): ExtractedRawEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as Record<string, unknown>;

  const title = typeof event.title === 'string' ? event.title.trim() : '';
  const date = typeof event.date === 'string' ? event.date.trim() : '';

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return {
    title,
    description: typeof event.description === 'string' ? event.description.trim() : null,
    date,
    startTime: typeof event.startTime === 'string' && /^\d{2}:\d{2}$/.test(event.startTime) ? event.startTime : null,
    endTime: typeof event.endTime === 'string' && /^\d{2}:\d{2}$/.test(event.endTime) ? event.endTime : null,
    isFree: event.isFree === true,
    priceMin: typeof event.priceMin === 'number' ? event.priceMin : null,
    priceMax: typeof event.priceMax === 'number' ? event.priceMax : null,
  };
}
