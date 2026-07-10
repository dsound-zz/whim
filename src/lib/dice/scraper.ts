import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveLocationData } from '@/lib/ingestion/location-validation';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { estimateEndTime } from '@/lib/utils/estimateEndTime';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

const DICE_NEW_YORK_URL = 'https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?date=this_week';

/** A single event card extracted from the DOM of a Dice listing page (browse or venue). */
export interface RawDiceCard {
  externalId: string;
  title: string;
  ticketUrl: string;
  imageUrl: string | null;
  dateStr: string;
  venueName: string;
  priceStr: string | null;
  address: string | null;
  rawTextBlocks: string[];
}

export interface DiceScrapeResults {
  inserted: number;
  updated: number;
  errors: number;
}

/** Structured data resolved from an individual Dice event detail page (via JSON-LD). */
export interface DiceEventDetail {
  lat: number | null;
  lng: number | null;
  startAt: Date | null;
  endAt: Date | null;
  description: string | null;
  priceMin: number | null;
}

export interface ProcessDiceEventOptions {
  /** Force the venue name (used by the venue crawler, where the venue is known up front). */
  forcedVenueName?: string;
  /** Force the address string used for geocoding. */
  forcedAddress?: string | null;
  /**
   * Pre-resolved detail data (coords/date/description). When provided, the per-event
   * detail-page fetch is skipped — the caller has already resolved it (e.g. the venue
   * crawler navigates each detail page with the stealth browser to avoid Dice's 403s).
   */
  preResolvedDetail?: DiceEventDetail;
}

/**
 * DOM-side extraction of Dice event cards. Runs inside the browser via `page.evaluate`,
 * so it must be fully self-contained (no closures over module scope). Shared by both the
 * browse scrape and the per-venue crawl.
 */
export function extractDiceEventCardsFromDom(): RawDiceCard[] {
  const eventElements = document.querySelectorAll('a[href*="/event/"]');
  const data: RawDiceCard[] = [];

  eventElements.forEach((el) => {
    const href = el.getAttribute('href');
    if (!href) return;

    const fullUrl = href.startsWith('http') ? href : `https://dice.fm${href}`;

    const imgEl = el.querySelector('img');
    const imageUrl = imgEl ? imgEl.getAttribute('src') : null;

    const titleEl =
      el.querySelector('h1, h2, h3, h4, h5, h6') ||
      el.querySelector('div[class*="Title"], p[class*="Title"]');
    let title = titleEl ? (titleEl as HTMLElement).innerText.trim() : null;

    const rawText = (el as HTMLElement).innerText;
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!title && lines.length > 0) {
      title = lines[0];
    }

    const dateStr = lines.length > 1 ? lines[1] : '';
    let venueName = 'Unknown Venue';
    let priceStr: string | null = null;

    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('$') || line.toLowerCase().includes('free')) {
        priceStr = line;
      } else if (line !== title && line !== dateStr) {
        venueName = line;
      }
    }

    data.push({
      externalId: href.split('/').pop() || href,
      title: title || 'Unknown Event',
      ticketUrl: fullUrl,
      imageUrl,
      dateStr,
      venueName,
      priceStr,
      address: null,
      rawTextBlocks: lines,
    });
  });

  return data;
}

/** Parse a price line ("$20", "Free") into a normalized (priceMin, isFree) pair. */
function parseDicePrice(priceStr: string | null): { priceMin: number | null; isFree: boolean } {
  if (!priceStr) return { priceMin: null, isFree: false };
  if (priceStr.toLowerCase().includes('free')) {
    return { priceMin: 0, isFree: true };
  }
  const match = priceStr.match(/\$(\d+(\.\d{1,2})?)/);
  return { priceMin: match ? parseFloat(match[1]) : null, isFree: false };
}

/** Best-effort heuristic date parse from a Dice card's date line (fallback only). */
function parseDiceCardDate(dateStr: string): Date {
  let startAt = new Date();
  startAt.setHours(20, 0, 0, 0); // Default to 8 PM

  const dateLower = dateStr.toLowerCase();
  const parsedDate = new Date(dateStr + (dateStr.includes('202') ? '' : ` ${new Date().getFullYear()}`));

  if (!isNaN(parsedDate.getTime())) {
    startAt = parsedDate;
  } else if (!dateLower.includes('tonight') && !dateLower.includes('today')) {
    startAt.setDate(startAt.getDate() + 1);
  }

  return startAt;
}

/** Fetch a Dice event detail page over plain HTTP and extract JSON-LD coords/date/description. */
async function fetchDiceEventDetailViaHttp(ticketUrl: string): Promise<DiceEventDetail> {
  const detail: DiceEventDetail = {
    lat: null,
    lng: null,
    startAt: null,
    endAt: null,
    description: null,
    priceMin: null,
  };

  try {
    const res = await fetch(ticketUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    if (!res.ok) return detail;

    const html = await res.text();
    const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    for (const match of matches) {
      try {
        const data = JSON.parse(match[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent') {
            if (item.location?.geo) {
              detail.lat = Number(item.location.geo.latitude);
              detail.lng = Number(item.location.geo.longitude);
            }
            if (item.description && typeof item.description === 'string') {
              detail.description = item.description.trim();
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD block
      }
    }

    // Fallback: meta description tag if JSON-LD had none
    if (!detail.description) {
      const metaMatch =
        html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
        html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
      if (metaMatch && metaMatch[1] && metaMatch[1].length > 30) {
        detail.description = metaMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      }
    }
  } catch (error) {
    console.error(`[Dice] Failed to fetch detail page for ${ticketUrl}`, error);
  }

  return detail;
}

/**
 * Normalize a single raw Dice card to the Whim schema and upsert it (with intra-source
 * and cross-platform dedup). Shared by the browse scrape and the per-venue crawl.
 */
export async function processDiceRawEvent(
  raw: RawDiceCard,
  results: DiceScrapeResults,
  options: ProcessDiceEventOptions = {},
): Promise<void> {
  if (raw.title === 'Unknown Event') return;

  const venueName = options.forcedVenueName ?? raw.venueName;

  // Resolve detail (coords/date/description). The venue crawler pre-resolves this via the
  // stealth browser; the browse path fetches it over plain HTTP here.
  const detail =
    options.preResolvedDetail ?? (raw.ticketUrl ? await fetchDiceEventDetailViaHttp(raw.ticketUrl) : null);

  // Prefer the structured JSON-LD start date; fall back to the fragile card heuristic.
  const startAt = detail?.startAt ?? parseDiceCardDate(raw.dateStr);

  const dateValidation = validateEventDates(startAt, detail?.endAt ?? null);
  if (!dateValidation.isValid) {
    console.warn(`[Dice] Skipping event ${raw.externalId}: ${dateValidation.rejectionReason}`);
    return;
  }

  const normalizedTitle = normalizeEventTitle(raw.title) ?? raw.title;

  const category = await classifyEventCategory({
    title: normalizedTitle,
    description: detail?.description ?? null,
    skipLlmFallback: false,
  });

  // Card price (browse) takes precedence; fall back to the detail page's JSON-LD offer price
  // (the venue crawler has no in-card price, so this is its primary price source).
  const cardPrice = parseDicePrice(raw.priceStr);
  const priceMin = cardPrice.priceMin ?? detail?.priceMin ?? null;
  const isFree = cardPrice.isFree || priceMin === 0;

  // Geocoding & validation fallback (keeps JSON-LD coords when valid).
  let lat: number | null = detail?.lat ?? null;
  let lng: number | null = detail?.lng ?? null;
  const address = options.forcedAddress ?? raw.address;
  let isVerified = false;

  if (venueName && venueName !== 'Unknown Venue') {
    const addressString = address || `${venueName}, New York, NY`;
    const locationData = await resolveLocationData(venueName, addressString, lat, lng);
    lat = locationData.lat;
    lng = locationData.lng;
    isVerified = locationData.isVerified;
  }

  const eventToInsert = {
    externalId: raw.externalId,
    sourceType: 'dice_scrape' as const,
    title: normalizedTitle,
    description: detail?.description ?? null,
    category: category as any,
    ticketUrl: raw.ticketUrl,
    imageUrl: raw.imageUrl,
    startAt,
    endAt: dateValidation.sanitizedEndAt ?? estimateEndTime(startAt, category),
    venueName,
    address,
    lat,
    lng,
    priceMin,
    isFree,
    platform: 'Dice',
    confidenceScore: 0.7,
    rawSource: { ...raw },
    status: 'active' as const,
    isVerified,
  };

  const dedupCandidate: IncomingEventForDedup = {
    externalId: eventToInsert.externalId,
    sourceType: eventToInsert.sourceType,
    title: eventToInsert.title,
    venueName: eventToInsert.venueName,
    lat: eventToInsert.lat,
    lng: eventToInsert.lng,
    startAt: eventToInsert.startAt,
    ticketUrl: eventToInsert.ticketUrl,
    platform: eventToInsert.platform,
    priceMin: eventToInsert.priceMin,
    priceMax: null,
    isFree: eventToInsert.isFree,
  };

  try {
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'dice_scrape')))
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
        const { confidenceScore: _cs, rawSource: _rs, isVerified: _iv, ...coreFields } = eventToInsert;
        await mergeIntoCanonical(
          dedupResult.canonicalEventId,
          dedupCandidate,
          coreFields,
          dedupResult.shouldUpdateCanonical,
        );
      } else {
        await db.insert(events).values({ ...eventToInsert, ticketUrls: buildInitialTicketUrls(dedupCandidate) });
        results.inserted++;
      }
    }
  } catch (error) {
    console.error('Failed to upsert Dice event:', raw.externalId, error);
    results.errors++;
  }
}

export async function scrapeDiceEvents(): Promise<DiceScrapeResults> {
  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');

  // Apply stealth plugin to bypass Cloudflare
  chromium.use(stealth());

  console.log('Launching Playwright with Stealth Plugin...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results: DiceScrapeResults = { inserted: 0, updated: 0, errors: 0 };

  try {
    console.log(`Navigating to ${DICE_NEW_YORK_URL}...`);
    await page.goto(DICE_NEW_YORK_URL, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for initial event cards...');
    await page.waitForSelector('a[href*="/event/"]', { timeout: 15000 });

    console.log('Scrolling to load more events...');
    let previousHeight = 0;
    let scrolls = 0;
    const maxScrolls = 10; // Only 10 needed for "this_week"

    while (scrolls < maxScrolls) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        const loadMoreBtn = await page.$('button:has-text("Load More"), button:has-text("Show More")');
        if (loadMoreBtn) {
          await loadMoreBtn.click();
          await page.waitForTimeout(2000);
        } else {
          console.log('Reached bottom of the infinite scroll.');
          break;
        }
      }
      previousHeight = newHeight;
      scrolls++;
      console.log(`Scroll iteration ${scrolls}/${maxScrolls} complete.`);
    }

    console.log('Extracting event data from the DOM...');
    const rawEvents = await page.evaluate(extractDiceEventCardsFromDom);

    console.log(`Extracted ${rawEvents.length} events. Normalizing and Upserting to Whim Schema...`);

    for (const raw of rawEvents) {
      await processDiceRawEvent(raw, results);
    }
  } catch (error) {
    console.error('Error during Playwright execution:', error);
  } finally {
    await browser.close();
    console.log('Playwright browser closed.');
  }

  return results;
}
