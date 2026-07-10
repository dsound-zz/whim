import type { Page } from 'playwright';
import {
  processDiceRawEvent,
  type DiceEventDetail,
  type DiceScrapeResults,
  type RawDiceCard,
} from './scraper';
import { DICE_VENUE_TARGETS, type DiceVenueTarget } from './venueTargets';

const DICE_VENUE_BASE_URL = 'https://dice.fm/venue/';

/**
 * DOM-side extraction for a Dice *venue* page. Unlike the browse page (where a whole card is a
 * single anchor), venue pages render multiple `a[href*="/event/"]` anchors per event — a text-
 * less image anchor plus a title anchor — so we merge all anchors sharing an event id. The date
 * lives outside the anchor here, so it is intentionally left blank: the crawler resolves an
 * accurate start date from each event's JSON-LD detail page instead.
 */
function extractDiceVenueCardsFromDom(): RawDiceCard[] {
  const anchors = Array.from(document.querySelectorAll('a[href*="/event/"]'));
  const byExternalId = new Map<string, { title: string; ticketUrl: string; imageUrl: string | null }>();

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    const fullUrl = href.startsWith('http') ? href : `https://dice.fm${href}`;
    const externalId = href.split('/').pop() || href;
    const text = ((anchor as HTMLElement).innerText || '').trim();
    const imgEl = anchor.querySelector('img');
    const imageUrl = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : null;

    const merged = byExternalId.get(externalId) ?? { title: '', ticketUrl: fullUrl, imageUrl: null };
    if (!merged.title && text) merged.title = text;
    if (!merged.imageUrl && imageUrl) merged.imageUrl = imageUrl;
    byExternalId.set(externalId, merged);
  }

  return [...byExternalId.entries()]
    .filter(([, value]) => value.title.length > 0)
    .map(([externalId, value]) => ({
      externalId,
      title: value.title,
      ticketUrl: value.ticketUrl,
      imageUrl: value.imageUrl,
      dateStr: '',
      venueName: 'Unknown Venue',
      priceStr: null,
      address: null,
      rawTextBlocks: [value.title],
    }));
}

/**
 * Resolve a Dice event detail page using the stealth browser (Dice 403s plain HTTP fetches,
 * so the browse path's HTTP detail fetch frequently fails for small venues). Reads JSON-LD
 * for accurate start/end dates, coordinates, and description.
 */
async function fetchDiceEventDetailViaBrowser(page: Page, ticketUrl: string): Promise<DiceEventDetail> {
  const detail: DiceEventDetail = {
    lat: null,
    lng: null,
    startAt: null,
    endAt: null,
    description: null,
    priceMin: null,
  };

  try {
    await page.goto(ticketUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Dice is a client-rendered SPA: the Event JSON-LD (with startDate) is injected *after*
    // domcontentloaded, so wait for it to appear before reading rather than racing it.
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((node) =>
            (node.textContent || '').includes('"startDate"'),
          ),
        { timeout: 10000 },
      )
      .catch(() => undefined);

    // Offer pricing hydrates a beat after startDate. Best-effort wait so we capture price;
    // resolves instantly once present, and is skipped (null price) for free/sold-out events.
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((node) =>
            (node.textContent || '').includes('"price"'),
          ),
        { timeout: 4000 },
      )
      .catch(() => undefined);

    const jsonLdBlocks: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
        (node) => node.textContent || '',
      ),
    );

    for (const block of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item['@type'] !== 'Event' && item['@type'] !== 'MusicEvent') continue;

          if (item.location?.geo) {
            detail.lat = Number(item.location.geo.latitude);
            detail.lng = Number(item.location.geo.longitude);
          }
          if (item.startDate) {
            const parsedStart = new Date(item.startDate);
            if (!isNaN(parsedStart.getTime())) detail.startAt = parsedStart;
          }
          if (item.endDate) {
            const parsedEnd = new Date(item.endDate);
            if (!isNaN(parsedEnd.getTime())) detail.endAt = parsedEnd;
          }
          if (typeof item.description === 'string') {
            detail.description = item.description.trim();
          }

          // Lowest offer price (Dice lists tiered offers, cheapest first is not guaranteed).
          const offers = Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [];
          for (const offer of offers) {
            const price = Number(offer?.price);
            if (!isNaN(price) && (detail.priceMin === null || price < detail.priceMin)) {
              detail.priceMin = price;
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD block
      }
    }
  } catch (error) {
    console.error(`[Dice Venue] Failed detail fetch for ${ticketUrl}`, error);
  }

  return detail;
}

/** Crawl a single Dice venue page and upsert every event it lists. */
async function crawlSingleVenue(
  page: Page,
  target: DiceVenueTarget,
  results: DiceScrapeResults,
): Promise<number> {
  const venueUrl = `${DICE_VENUE_BASE_URL}${target.slug}`;
  console.log(`[Dice Venue] Crawling ${target.displayName} -> ${venueUrl}`);

  await page.goto(venueUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    await page.waitForSelector('a[href*="/event/"]', { timeout: 15000 });
  } catch {
    console.warn(`[Dice Venue] No event cards found for ${target.displayName} (page may be empty or blocked).`);
    return 0;
  }

  // Venue pages are short; a few scrolls is plenty to load the full upcoming list.
  let previousHeight = 0;
  const maxScrolls = 5;
  for (let scroll = 0; scroll < maxScrolls; scroll++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) break;
    previousHeight = newHeight;
  }

  const cards = await page.evaluate(extractDiceVenueCardsFromDom);

  console.log(`[Dice Venue] ${target.displayName}: found ${cards.length} unique event cards.`);

  for (const card of cards) {
    const preResolvedDetail = await fetchDiceEventDetailViaBrowser(page, card.ticketUrl);
    await processDiceRawEvent(card, results, {
      forcedVenueName: target.displayName,
      preResolvedDetail,
    });
  }

  return cards.length;
}

/**
 * Crawl each targeted Dice venue page directly, picking up the long-tail events that never
 * appear on Dice's popularity-ranked browse feed.
 */
export async function scrapeDiceVenueEvents(
  targets: DiceVenueTarget[] = DICE_VENUE_TARGETS,
): Promise<DiceScrapeResults> {
  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');

  chromium.use(stealth());

  console.log(`[Dice Venue] Launching stealth browser for ${targets.length} venue(s)...`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results: DiceScrapeResults = { inserted: 0, updated: 0, errors: 0 };

  try {
    for (const target of targets) {
      try {
        await crawlSingleVenue(page, target, results);
      } catch (error) {
        console.error(`[Dice Venue] Error crawling ${target.displayName}:`, error);
        results.errors++;
      }
    }
  } finally {
    await browser.close();
    console.log('[Dice Venue] Browser closed.');
  }

  return results;
}
