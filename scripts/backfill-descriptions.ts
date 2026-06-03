/**
 * backfill-descriptions.ts
 *
 * Fetches the ticket page for events missing descriptions, sends the page text
 * to Gemini 2.5 Flash, and asks it to write a concise 2-3 sentence description.
 *
 * Usage:
 *   npm run backfill:descriptions                          # Backfill 50 events
 *   npm run backfill:descriptions -- --limit 200           # Backfill 200 events
 *   npm run backfill:descriptions -- --source eventbrite_api
 *   npm run backfill:descriptions -- --dry-run             # Preview only, no DB writes
 */

import 'dotenv/config';

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { SchemaType } from '@google/generative-ai';
import { getGeminiModel } from '@/lib/utils/gemini';

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1 || flagIndex + 1 >= args.length) return undefined;
  return args[flagIndex + 1];
}

const limitValue = parseInt(getArgValue('--limit') ?? '50', 10);
const isDryRun = args.includes('--dry-run');
const sourceFilter = getArgValue('--source');

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PAGE_TEXT_CHARS = 6_000;

/**
 * Domains where plain HTTP fetching is blocked (JS-rendered, auth-gated, or
 * aggressively bot-blocking). We skip these gracefully.
 */
const SCRAPE_BLOCKED_DOMAINS = [
  'dice.fm',
  'songkick.com',
];

// ─── Page Fetching ───────────────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Strip script/style blocks, then all HTML tags, then collapse whitespace
    const cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.slice(0, MAX_PAGE_TEXT_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── LLM Description Generation ─────────────────────────────────────────────

interface GeneratedDescription {
  description: string;
  confidence: string; // "high" | "medium" | "low"
}

async function generateDescription(
  pageText: string,
  eventTitle: string,
  venueName: string | null
): Promise<GeneratedDescription | null> {
  const systemPrompt = `You are a concise event copywriter. Given the raw text from an event ticket page, write a short, engaging description of the event.

Rules:
- Write 2-3 sentences maximum
- Focus on what the event IS (genre, type, who's performing/presenting)
- Include notable details (cover charge info, age restrictions, special guests) if present
- Do NOT include date, time, or venue name — those are shown separately in the UI
- Do NOT use marketing hype or exclamation marks
- If the page text is insufficient or clearly not about this specific event, set confidence to "low"
- Use a neutral, informative tone

Respond ONLY with valid JSON matching this exact schema:
{"description": string, "confidence": "high" | "medium" | "low"}`;

  const userPrompt = `Event: ${eventTitle}
Venue: ${venueName ?? '(unknown)'}

Page text (truncated):
---
${pageText}
---

Write a concise description for this event.`;

  const model = getGeminiModel({
    systemInstruction: systemPrompt,
    temperature: 0.3,
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        description: { type: SchemaType.STRING },
        confidence: { type: SchemaType.STRING },
      },
      required: ['description', 'confidence'],
    },
  });

  try {
    const result = await model.generateContent(userPrompt);
    const rawText = result.response.text().trim();
    const cleanText = rawText
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanText) as GeneratedDescription;

    if (typeof parsed.description !== 'string' || parsed.description.length < 10) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`  [LLM error] ${error}`);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Whim — Backfill Missing Descriptions    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Limit:      ${limitValue}`);
  console.log(`  Dry run:    ${isDryRun}`);
  console.log(`  Source:     ${sourceFilter ?? 'all'}`);
  console.log('');

  const startTime = Date.now();

  // Find active events with no description that have a ticketUrl
  const whereConditions = [
    eq(events.status, 'active'),
    isNull(events.description),
    sql`${events.ticketUrl} IS NOT NULL`,
  ];

  if (sourceFilter) {
    whereConditions.push(eq(events.sourceType, sourceFilter as any));
  }

  const candidateEvents = await db
    .select({
      id: events.id,
      title: events.title,
      venueName: events.venueName,
      ticketUrl: events.ticketUrl,
      sourceType: events.sourceType,
    })
    .from(events)
    .where(and(...whereConditions))
    .orderBy(events.startAt)
    .limit(limitValue);

  console.log(`  Found ${candidateEvents.length} events missing descriptions\n`);

  let filledCount = 0;
  let skippedBlockedCount = 0;
  let skippedFetchFailCount = 0;
  let skippedLowConfidenceCount = 0;
  let skippedLlmFailCount = 0;

  for (let eventIndex = 0; eventIndex < candidateEvents.length; eventIndex++) {
    const event = candidateEvents[eventIndex];
    const shortTitle = event.title.slice(0, 50) + (event.title.length > 50 ? '…' : '');

    // Check if domain is blocked
    const isBlocked = SCRAPE_BLOCKED_DOMAINS.some(
      (domain) => event.ticketUrl!.includes(domain)
    );

    if (isBlocked) {
      console.log(`  [${eventIndex + 1}] SKIP (blocked domain) ${shortTitle}`);
      skippedBlockedCount++;
      continue;
    }

    // Fetch page text
    const pageText = await fetchPageText(event.ticketUrl!);
    if (!pageText || pageText.length < 50) {
      console.log(`  [${eventIndex + 1}] SKIP (fetch failed) ${shortTitle}`);
      skippedFetchFailCount++;
      // Throttle even on failures to be polite
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    // Generate description via Gemini
    const generatedResult = await generateDescription(
      pageText,
      event.title,
      event.venueName
    );

    if (!generatedResult) {
      console.log(`  [${eventIndex + 1}] SKIP (LLM failed) ${shortTitle}`);
      skippedLlmFailCount++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }

    if (generatedResult.confidence === 'low') {
      console.log(`  [${eventIndex + 1}] SKIP (low confidence) ${shortTitle}`);
      skippedLowConfidenceCount++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }

    // Save to database
    if (!isDryRun) {
      await db
        .update(events)
        .set({
          description: generatedResult.description,
          updatedAt: new Date(),
        })
        .where(eq(events.id, event.id));
    }

    filledCount++;
    const confidenceBadge =
      generatedResult.confidence === 'high' ? '✓ HIGH' : '~ MED';
    console.log(
      `  [${eventIndex + 1}] ${confidenceBadge} ${shortTitle}`
    );

    if (isDryRun) {
      console.log(`         "${generatedResult.description.slice(0, 120)}…"`);
    }

    // Throttle to avoid rate limits on both the page fetch and Gemini
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n─── Summary ───');
  console.log(`  Total candidates:     ${candidateEvents.length}`);
  console.log(`  Descriptions filled:  ${filledCount}`);
  console.log(`  Skipped (blocked):    ${skippedBlockedCount}`);
  console.log(`  Skipped (fetch fail): ${skippedFetchFailCount}`);
  console.log(`  Skipped (low conf):   ${skippedLowConfidenceCount}`);
  console.log(`  Skipped (LLM fail):   ${skippedLlmFailCount}`);
  console.log(`  Duration:             ${durationSeconds}s`);

  if (isDryRun) {
    console.log('\n  [DRY RUN] No database changes were made.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error during backfill:', error);
  process.exit(1);
});
