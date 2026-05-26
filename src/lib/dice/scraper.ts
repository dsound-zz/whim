import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { and, eq, ilike } from 'drizzle-orm';
import { resolveLocationData } from '@/lib/ingestion/location-validation';

const DICE_NEW_YORK_URL = 'https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?date=this_week';

export async function scrapeDiceEvents() {
  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');

  // Apply stealth plugin to bypass Cloudflare
  chromium.use(stealth());

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
        
        if (!title && lines.length > 0) {
            title = lines[0]; 
        }

        let dateStr = lines.length > 1 ? lines[1] : '';
        let venueName = 'Unknown Venue';
        let priceStr = null;
        let address = null; // Address is rarely on the browse card, usually just venue name
        
        // Loop from index 2 onwards since 0 is title and 1 is date
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
          address,
          rawTextBlocks: lines,
        });
      });

      return data;
    });

    console.log(`Extracted ${rawEvents.length} events. Normalizing and Upserting to Whim Schema...`);

    for (const raw of rawEvents) {
      if (raw.title === 'Unknown Event') continue;

      // Better Date Parsing
      let startAt = new Date();
      startAt.setHours(20, 0, 0, 0); // Default to 8 PM
      
      const dateLower = raw.dateStr.toLowerCase();
      
      // Attempt to parse standard date strings (e.g. "Sat, May 24, 10:00 PM")
      const parsedDate = new Date(raw.dateStr + (raw.dateStr.includes('202') ? '' : ` ${new Date().getFullYear()}`));
      if (!isNaN(parsedDate.getTime())) {
          startAt = parsedDate;
      } else if (!dateLower.includes('tonight') && !dateLower.includes('today')) {
          // Fallback heuristic for the "this_week" scrape
          startAt.setDate(startAt.getDate() + 1); 
      }

      // Category Detection
      let category = 'music';
      const titleLower = raw.title.toLowerCase();
      if (['club', 'dj', 'house', 'techno', 'afrobeats', 'disco', 'session'].some(k => titleLower.includes(k))) {
          category = 'nightlife';
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

      // Geocoding & Validation Fallback
      let lat: number | null = null;
      let lng: number | null = null;
      let address = raw.address;
      let isVerified = false;

      // 1. Attempt to fetch JSON-LD for exact coordinates from detail page
      if (raw.ticketUrl) {
         try {
            const res = await fetch(raw.ticketUrl, {
               headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
            });
            if (res.ok) {
               const html = await res.text();
               const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
               for (const match of matches) {
                  try {
                     const data = JSON.parse(match[1]);
                     const items = Array.isArray(data) ? data : [data];
                     for (const item of items) {
                        if ((item['@type'] === 'Event' || item['@type'] === 'MusicEvent') && item.location?.geo) {
                           lat = Number(item.location.geo.latitude);
                           lng = Number(item.location.geo.longitude);
                        }
                     }
                  } catch (e) {}
               }
            }
         } catch (e) {
            console.error(`[Dice] Failed to fetch JSON-LD for ${raw.externalId}`, e);
         }
      }

      // 2. Validate and fallback via Mapbox
      if (raw.venueName && raw.venueName !== 'Unknown Venue') {
         const addressString = address || `${raw.venueName}, New York, NY`;
         const locationData = await resolveLocationData(raw.venueName, addressString, lat, lng);
         lat = locationData.lat;
         lng = locationData.lng;
         isVerified = locationData.isVerified;
      }

      const eventToInsert = {
        externalId: raw.externalId,
        sourceType: 'dice_scrape' as const,
        title: raw.title,
        category: category as any,
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
        isVerified,
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
