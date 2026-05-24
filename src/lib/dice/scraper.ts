import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Apply stealth plugin to bypass Cloudflare
chromium.use(stealth());

const DICE_NEW_YORK_URL = 'https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?date=this_week';

export async function scrapeDiceEvents() {
  console.log('Launching Playwright with Stealth Plugin...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = { inserted: 0, updated: 0, errors: 0 };

  try {
    console.log(`Navigating to ${DICE_NEW_YORK_URL}...`);
    await page.goto(DICE_NEW_YORK_URL, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for initial event cards...');
    await page.waitForSelector('a[href*="/event/"]', { timeout: 15000 });

    // Handle Infinite Scroll / Load More
    console.log('Scrolling to load more events...');
    let previousHeight = 0;
    let scrolls = 0;
    const maxScrolls = 10; // Only 10 needed for "this_week"
    
    while (scrolls < maxScrolls) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000); // Give time for DOM render and network requests
      
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        // Try looking for a load more button
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

    // Extract all event links/cards natively in the browser
    const rawEvents = await page.evaluate(() => {
      const eventElements = document.querySelectorAll('a[href*="/event/"]');
      const data: any[] = [];

      eventElements.forEach((el) => {
        const href = el.getAttribute('href');
        if (!href) return;
        
        const fullUrl = href.startsWith('http') ? href : `https://dice.fm${href}`;
        
        // Artist Image (Usually the main img in the card)
        const imgEl = el.querySelector('img');
        const imageUrl = imgEl ? imgEl.getAttribute('src') : null;

        // Title/Event Name
        const titleEl = el.querySelector('h1, h2, h3, h4, h5, h6') || el.querySelector('div[class*="Title"], p[class*="Title"]');
        let title = titleEl ? (titleEl as HTMLElement).innerText.trim() : null;

        // Raw Text Heuristics for Date, Venue, Price
        const rawText = (el as HTMLElement).innerText;
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        
        if (!title && lines.length > 1) {
            title = lines[1]; // Typically 2nd line is title after Date
        }

        let dateStr = lines.length > 0 ? lines[0] : '';
        let venueName = 'Unknown Venue';
        let priceStr = null;
        let address = null; // Address is rarely on the browse card, usually just venue name
        
        for (const line of lines) {
           if (line.includes('$') || line.toLowerCase().includes('free')) {
               priceStr = line;
           } else if (line !== title && line !== dateStr) {
               venueName = line; // Assume remaining text is the venue
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
          address,
          rawTextBlocks: lines,
        });
      });

      return data;
    });

    console.log(`Extracted ${rawEvents.length} events. Normalizing and Upserting to Whim Schema...`);

    for (const raw of rawEvents) {
      if (raw.title === 'Unknown Event') continue;

      // Since we are using ?date=this_week, we trust Dice's date filtering.
      // We will just do a simple mock date for the MVP.
      const startAt = new Date();
      startAt.setHours(20, 0, 0, 0); // Default to 8 PM
      if (!raw.dateStr.toLowerCase().includes('tonight') && !raw.dateStr.toLowerCase().includes('today')) {
         startAt.setDate(startAt.getDate() + 1); 
      }

      // Price Parsing
      let priceMin = null;
      let isFree = false;
      if (raw.priceStr) {
         if (raw.priceStr.toLowerCase().includes('free')) {
             isFree = true;
             priceMin = 0;
         } else {
             const match = raw.priceStr.match(/\$(\d+(\.\d{1,2})?)/);
             if (match) priceMin = parseFloat(match[1]);
         }
      }

      // Geocoding via Mapbox
      let lat = null;
      let lng = null;
      let address = raw.address;

      if (raw.venueName && raw.venueName !== 'Unknown Venue' && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
         try {
             // Append strict NYC context and use bounding box to prevent UK edge cases
             const query = encodeURIComponent(`${raw.venueName}, New York City, NY, USA`);
             const bbox = "-74.5,40.4,-73.5,41.0"; // strict NYC bounding box
             const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&limit=1&bbox=${bbox}`);
             const geoData = await geoRes.json();
             if (geoData.features && geoData.features.length > 0) {
                 const center = geoData.features[0].center; // [lng, lat]
                 lng = center[0];
                 lat = center[1];
                 address = geoData.features[0].place_name;
             } else {
                 console.log(`[Geocode Miss] No NYC coordinates found for venue: ${raw.venueName}`);
             }
         } catch (err) {
             console.error('Geocoding failed for', raw.venueName);
         }
      }

      const eventToInsert = {
        externalId: raw.externalId,
        sourceType: 'dice_scrape' as const,
        title: raw.title,
        ticketUrl: raw.ticketUrl,
        imageUrl: raw.imageUrl,
        startAt,
        venueName: raw.venueName,
        address,
        lat,
        lng,
        priceMin,
        isFree,
        platform: 'Dice',
        rawSource: { ...raw },
        status: 'active' as const,
      };

      try {
        const existing = await db.select().from(events).where(
          and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'dice_scrape'))
        );

        if (existing.length > 0) {
          await db.update(events).set(eventToInsert).where(eq(events.id, existing[0].id));
          results.updated++;
        } else {
          await db.insert(events).values(eventToInsert);
          results.inserted++;
        }
      } catch (e) {
        console.error('Failed to upsert Dice event:', raw.externalId, e);
        results.errors++;
      }
    }

  } catch (error) {
    console.error('Error during Playwright execution:', error);
  } finally {
    await browser.close();
    console.log('Playwright browser closed.');
  }

  return results;
}
