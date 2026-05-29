import * as dotenv from 'dotenv';
dotenv.config();

import { 
  normalizeSongkickEvent, 
  upsertSongkickEvent, 
  updateSongkickIngestionSourceStatus, 
  RawSongkickEvent 
} from '../src/lib/ingestion/songkick';

async function main(): Promise<void> {
  console.log('[Songkick] Starting scrape:', new Date().toISOString());

  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');

  // Apply stealth plugin to bypass bot detection/Cloudflare
  chromium.use(stealth());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  try {
    await page.goto('https://www.songkick.com/metro-areas/7644-us-new-york-nyc', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for event listings to render
    await page.waitForSelector('li.event-listings-element', {
      timeout: 15000,
    });

    let allRawEvents: RawSongkickEvent[] = [];
    let hasMorePages = true;
    let currentPage = 1;

    while (hasMorePages && currentPage <= 10) {
      console.log(`[Songkick] Extracting events from page ${currentPage}...`);
      const pageEvents = await extractEventsFromPage(page);
      console.log(`[Songkick] Found ${pageEvents.length} events on page ${currentPage}`);
      
      allRawEvents = [...allRawEvents, ...pageEvents];

      // Try to get next page URL
      const nextPageUrl = await page.evaluate(() => {
        const nextLink = document.querySelector('a.next_page[rel="next"], a[rel="next"], .pagination a.next');
        return nextLink ? (nextLink as HTMLAnchorElement).href : null;
      });

      if (nextPageUrl) {
        console.log(`[Songkick] Navigating to page ${currentPage + 1}: ${nextPageUrl}`);
        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000); // Be polite, allow hydration
        currentPage++;
      } else {
        console.log('[Songkick] No more pages.');
        hasMorePages = false;
      }
    }

    // Deduplicate in-memory by songkickId
    const uniqueRawEvents = Array.from(
      new Map(
        allRawEvents
          .filter(e => e.songkickId !== '')
          .map(e => [e.songkickId, e])
      ).values()
    );

    console.log(`[Songkick] Found ${allRawEvents.length} total events. Unique: ${uniqueRawEvents.length}`);

    let eventsUpserted = 0;
    let errors = 0;

    for (const rawEvent of uniqueRawEvents) {
      try {
        // 1. Fetch JSON-LD from detail page to get exact coordinates
        if (rawEvent.ticketUrl) {
          try {
            const detailUrl = rawEvent.ticketUrl.startsWith('http') ? rawEvent.ticketUrl : `https://www.songkick.com${rawEvent.ticketUrl}`;
            const res = await fetch(detailUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            if (res.ok) {
              const html = await res.text();
              const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
              for (const match of matches) {
                try {
                  const data = JSON.parse(match[1]);
                  const events = Array.isArray(data) ? data : [data];
                  for (const ev of events) {
                    if ((ev['@type'] === 'MusicEvent' || ev['@type'] === 'Event') && ev.location?.geo) {
                      rawEvent.lat = Number(ev.location.geo.latitude);
                      rawEvent.lng = Number(ev.location.geo.longitude);
                    }
                  }
                } catch (e) {}
              }
            }
          } catch (err) {
            console.error(`[Songkick] Failed to fetch JSON-LD for ${rawEvent.songkickId}`, err);
          }
        }

        const normalized = await normalizeSongkickEvent(rawEvent);
        if (normalized) {
          await upsertSongkickEvent(normalized);
          eventsUpserted++;
          if (eventsUpserted % 20 === 0) {
            console.log(`[Songkick] Ingestion progress: ${eventsUpserted}/${uniqueRawEvents.length} events upserted`);
          }
        }
      } catch (error) {
        console.error(`[Songkick] Failed to upsert event ${rawEvent.songkickId}:`, error);
        errors++;
      }
    }

    await updateSongkickIngestionSourceStatus('active');
    console.log('[Songkick] Complete:', { eventsUpserted, errors });

  } catch (error) {
    console.error('[Songkick] Fatal error during scraping:', error);
    await updateSongkickIngestionSourceStatus('error', String(error));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

async function extractEventsFromPage(page: any): Promise<RawSongkickEvent[]> {
  return page.evaluate(() => {
    const eventElements = document.querySelectorAll('li.event-listings-element');

    return Array.from(eventElements).map(element => {
      // 1. Get exact datetime
      const timeEl = element.querySelector('time');
      const dateText = timeEl ? timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '' : '';

      // 2. Ticket/event detail URL
      const linkEl = element.querySelector('.image-wrapper a.thumb, .artists a.event-link');
      const ticketUrl = linkEl ? linkEl.getAttribute('href') || '' : '';

      // 3. Extract Songkick ID from URL path (e.g. /concerts/12345-slug or /id/67890-slug)
      let songkickId = '';
      if (ticketUrl) {
        const concertMatch = ticketUrl.match(/\/concerts\/(\d+)/);
        if (concertMatch) {
          songkickId = concertMatch[1];
        } else {
          const festivalMatch = ticketUrl.match(/\/id\/(\d+)/);
          if (festivalMatch) {
            songkickId = festivalMatch[1];
          } else {
            const fallbackMatch = ticketUrl.match(/\/(\d+)/);
            if (fallbackMatch) songkickId = fallbackMatch[1];
          }
        }
      }

      // 4. Artists and Title
      const artistLink = element.querySelector('.artists a.event-link');
      const headline = artistLink?.querySelector('strong')?.textContent?.trim() || '';
      const supportText = artistLink?.querySelector('.support')?.textContent?.trim() || '';

      // Construct artist names array
      const artistNames: string[] = [];
      if (headline) {
        artistNames.push(headline);
      }
      if (supportText) {
        // Split support artists on commas, and/&
        const supports = supportText
          .split(/,|\band\b|&/g)
          .map(s => s.replace(/^and\s+/i, '').trim())
          .filter(Boolean);
        artistNames.push(...supports);
      }

      const title = headline || 'Live Event';

      // 5. Venue and Location
      const locationEl = element.querySelector('.location');
      const venueLink = locationEl?.querySelector('a.venue-link');
      const venueName = venueLink?.textContent?.trim() || locationEl?.querySelector('span')?.textContent?.trim() || 'Unknown Venue';
      const cityName = locationEl?.querySelector('.city-name')?.textContent?.trim() || '';

      // 6. Image URL
      const imgEl = element.querySelector('.image-wrapper img');
      const rawImgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || null;
      let imageUrl = null;
      if (rawImgUrl) {
        imageUrl = rawImgUrl.startsWith('//') ? `https:${rawImgUrl}` : rawImgUrl;
        // Don't save placeholder avatars
        if (imageUrl.includes('default-artist.png')) {
          imageUrl = null;
        }
      }

      return {
        songkickId,
        title,
        artistNames,
        dateText,
        venueName,
        venueAddress: cityName,
        ticketUrl,
        imageUrl
      };
    });
  });
}

main()
  .then(() => {
    console.log('[Songkick Scraper] Completed successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[Songkick Scraper] Fatal error:', error);
    process.exit(1);
  });
