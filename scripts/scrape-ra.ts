import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { db } from '../src/db';
import { events, ingestionSources } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

// Apply stealth plugin
chromium.use(stealth());

async function main() {
  console.log('[RA] Starting scrape:', new Date().toISOString());
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    console.log('[RA] Navigating to RA NYC events...');
    await page.goto('https://ra.co/events/us/newyork', { waitUntil: 'networkidle' });

    console.log('[RA] Waiting for event listings to appear...');
    await page.waitForSelector('[data-testid="event-listing-list"]', { timeout: 15000 }).catch(() => null);

    console.log('[RA] Scrolling to load more events...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    console.log('[RA] Extracting event data...');
    const rawEvents = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-tracking-id="event"]'));
      
      return items.map(item => {
        // Fallback selectors, RA changes structure frequently
        const titleEl = item.querySelector('h3, [data-testid="event-title"]');
        const title = titleEl?.textContent?.trim() || '';
        
        const linkEl = item.querySelector('a[href*="/events/"]');
        const urlPath = linkEl?.getAttribute('href') || '';
        const ticketUrl = urlPath ? `https://ra.co${urlPath}` : '';
        const raEventId = urlPath.split('/').pop() || '';
        
        const imgEl = item.querySelector('img');
        const imageUrl = imgEl?.src || null;
        
        // This relies on typical RA text patterns (time, venue names often next to each other)
        const textElements = Array.from(item.querySelectorAll('div, span'))
          .map(el => el.textContent?.trim())
          .filter(Boolean);
        
        const priceStr = textElements.find(t => t?.includes('$') || t?.toLowerCase() === 'free') || null;
        const venueName = item.querySelector('[data-testid="event-venue"]')?.textContent?.trim() || 'TBA';
        
        // Assuming current date if scraping "tonight/upcoming", usually RA lists sections by date headers
        // For robust extraction, we'd traverse up to the nearest date header. Here we'll use a naive fallback.
        
        return {
          title,
          venueName,
          ticketUrl,
          imageUrl,
          priceStr,
          raEventId,
          rawTextNodes: textElements
        };
      });
    });

    let upserted = 0;

    for (const raw of rawEvents) {
      if (!raw.title || !raw.raEventId) continue;

      let priceMin = null;
      let isFree = false;
      if (raw.priceStr) {
        if (raw.priceStr.toLowerCase().includes('free')) {
          isFree = true;
          priceMin = 0;
        } else {
          const match = raw.priceStr.match(/\\$?(\\d+\\.?\\d*)/);
          if (match) priceMin = parseFloat(match[1]);
        }
      }

      // Geocode via Mapbox
      let lat = null, lng = null, address = null;
      if (raw.venueName && raw.venueName !== 'TBA' && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
        try {
          const query = encodeURIComponent(`${raw.venueName}, New York City, NY, USA`);
          const bbox = "-74.5,40.4,-73.5,41.0"; 
          const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&limit=1&bbox=${bbox}`);
          const geoData = await geoRes.json();
          if (geoData.features && geoData.features.length > 0) {
            const center = geoData.features[0].center;
            lng = center[0];
            lat = center[1];
            address = geoData.features[0].place_name;
          }
        } catch (err) {
          console.error(`[RA] Geocoding failed for ${raw.venueName}`);
        }
      }

      const eventData = {
        externalId: raw.raEventId,
        sourceType: 'ra_scrape' as any,
        title: raw.title,
        venueName: raw.venueName,
        address,
        lat,
        lng,
        startAt: new Date(), // RA parsing is complex, defaulting to naive for now
        isFree,
        priceMin,
        priceMax: null,
        ticketUrl: raw.ticketUrl,
        imageUrl: raw.imageUrl,
        platform: 'Resident Advisor',
        status: 'active' as const,
        rawSource: raw
      };

      const existing = await db.select().from(events).where(
        and(eq(events.externalId, raw.raEventId), eq(events.sourceType, 'ra_scrape' as any))
      );

      if (existing.length > 0) {
        await db.update(events).set(eventData).where(eq(events.id, existing[0].id));
      } else {
        await db.insert(events).values(eventData);
      }
      upserted++;
    }

    // Update ingestion tracking
    await db
      .update(ingestionSources)
      .set({
        lastSyncedAt: new Date(),
        syncStatus: 'active',
        errorMessage: null,
      })
      .where(eq(ingestionSources.type, 'ra_scrape' as any));

    console.log(`[RA] Scrape complete. Upserted ${upserted} events.`);
  } catch (e) {
    console.error('[RA] Fatal error:', e);
    await db
      .update(ingestionSources)
      .set({
        syncStatus: 'error',
        errorMessage: String(e),
      })
      .where(eq(ingestionSources.type, 'ra_scrape' as any));
  } finally {
    await browser.close();
  }
}

main().catch(console.error).finally(() => process.exit(0));
