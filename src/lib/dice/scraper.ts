import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { and, eq, ilike } from 'drizzle-orm';
import { resolveLocationData } from '@/lib/ingestion/location-validation';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

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
      
      const parsedDate = new Date(raw.dateStr + (raw.dateStr.includes('202') ? '' : ` ${new Date().getFullYear()}`));
      if (!isNaN(parsedDate.getTime())) {
          startAt = parsedDate;
      } else if (!dateLower.includes('tonight') && !dateLower.includes('today')) {
          startAt.setDate(startAt.getDate() + 1); 
      }

      // Date validation
      const dateValidation = validateEventDates(startAt, null);
      if (!dateValidation.isValid) {
        console.warn(`[Dice] Skipping event ${raw.externalId}: ${dateValidation.rejectionReason}`);
        continue;
      }

      // Title normalization
      const normalizedTitle = normalizeEventTitle(raw.title) ?? raw.title;

      // Category classification using the shared classifier
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: null, // description not yet available (fetched after this)
        skipLlmFallback: false,
      });
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

      // 1. Attempt to fetch JSON-LD for exact coordinates + description from detail page
      let eventDescription: string | null = null;

      if (raw.ticketUrl) {
         try {
            const res = await fetch(raw.ticketUrl, {
               headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
            });
            if (res.ok) {
               const html = await res.text();

               // Extract JSON-LD structured data
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
                        // Dice embeds event descriptions in JSON-LD
                        if ((item['@type'] === 'Event' || item['@type'] === 'MusicEvent') && item.description && typeof item.description === 'string') {
                           eventDescription = item.description.trim();
                        }
                     }
                  } catch (e) {}
               }

               // Fallback: extract meta description if JSON-LD had no description
               if (!eventDescription) {
                  const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
                     || html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
                  if (metaMatch && metaMatch[1] && metaMatch[1].length > 30) {
                     eventDescription = metaMatch[1]
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .trim();
                  }
               }
            }
         } catch (e) {
            console.error(`[Dice] Failed to fetch detail page for ${raw.externalId}`, e);
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
        title: normalizedTitle,
        description: eventDescription,
        category: category as any,
        ticketUrl: raw.ticketUrl,
        imageUrl: raw.imageUrl,
        startAt,
        endAt: dateValidation.sanitizedEndAt,
        venueName: raw.venueName,
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
        // Intra-source dedup
        const existing = await db.select({ id: events.id }).from(events).where(
          and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'dice_scrape'))
        ).limit(1);

        if (existing.length > 0) {
          await db.update(events).set({
            ...eventToInsert,
            ticketUrls: buildInitialTicketUrls(dedupCandidate),
          }).where(eq(events.id, existing[0].id));
          results.updated++;
        } else {
          // Cross-platform dedup check
          const dedupResult = await findCanonicalMatch(dedupCandidate);

          if (dedupResult.isMatch && dedupResult.canonicalEventId) {
            const { confidenceScore: _cs, rawSource: _rs, isVerified: _iv, ...coreFields } = eventToInsert;
            await mergeIntoCanonical(
              dedupResult.canonicalEventId,
              dedupCandidate,
              coreFields,
              dedupResult.shouldUpdateCanonical
            );
            // Dice is low-trust, so merges rarely promote; just count as handled
          } else {
            await db.insert(events).values({
              ...eventToInsert,
              ticketUrls: buildInitialTicketUrls(dedupCandidate),
            });
            results.inserted++;
          }
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
