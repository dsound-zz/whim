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
  console.log('[Dice] Starting scrape:', new Date().toISOString());
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    console.log('[Dice] Navigating to NYC events for this week...');
    await page.goto('https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?date=this_week', { waitUntil: 'networkidle' });

    console.log('[Dice] Waiting for event cards...');
    await page.waitForSelector('a[data-id="EventCard"]', { timeout: 15000 });

    console.log('[Dice] Scrolling to load more events...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    console.log('[Dice] Extracting event data...');
    const rawEvents = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[data-id="EventCard"]'));
      return cards.map(card => {
        const url = (card as HTMLAnchorElement).href;
        const img = card.querySelector('img')?.src || null;
        const infoDiv = card.querySelector('.EventCard__EventInfo-sc-3199df60-7');
        const title = infoDiv?.querySelector('h3')?.textContent?.trim() || '';
        const venue = infoDiv?.querySelector('.EventCard__EventVenue-sc-3199df60-8')?.textContent?.trim() || '';
        const dateStr = infoDiv?.querySelector('.EventCard__EventDate-sc-3199df60-10')?.textContent?.trim() || '';
        const priceStr = infoDiv?.querySelector('.EventCard__EventPrice-sc-3199df60-12')?.textContent?.trim() || '';
        
        return { url, img, title, venue, dateStr, priceStr };
      });
    });

    let upserted = 0;
    
    for (const raw of rawEvents) {
      if (!raw.title || !raw.url) continue;

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

      // Geocode
      let lat = null, lng = null, address = null;
      if (raw.venue && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
        try {
          const query = encodeURIComponent(`${raw.venue}, New York City, NY, USA`);
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
          console.error(`[Dice] Geocoding failed for ${raw.venue}`);
        }
      }

      const externalId = raw.url.split('/event/')[1]?.split('-')[0] || raw.url;

      const eventData = {
        externalId,
        sourceType: 'dice_scrape' as const,
        title: raw.title,
        venueName: raw.venue,
        address,
        lat,
        lng,
        startAt: new Date(), // naive approximation, real script should parse dateStr
        isFree,
        priceMin,
        priceMax: null,
        ticketUrl: raw.url,
        imageUrl: raw.img,
        platform: 'Dice',
        status: 'active' as const,
        rawSource: raw
      };

      const existing = await db.select().from(events).where(
        and(eq(events.externalId, externalId), eq(events.sourceType, 'dice_scrape'))
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
      .where(eq(ingestionSources.type, 'dice_scrape'));

    console.log(`[Dice] Scrape complete. Upserted ${upserted} events.`);
  } catch (e) {
    console.error('[Dice] Fatal error:', e);
    await db
      .update(ingestionSources)
      .set({
        syncStatus: 'error',
        errorMessage: String(e),
      })
      .where(eq(ingestionSources.type, 'dice_scrape'));
  } finally {
    await browser.close();
  }
}

main().catch(console.error).finally(() => process.exit(0));
