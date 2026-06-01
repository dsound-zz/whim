/**
 * Resident Advisor (RA) scraper.
 *
 * Scrapes ra.co/events/us/newyork for NYC club nights, DJ sets, and
 * electronic music events. RA specializes in the underground nightlife
 * scene that Ticketmaster, SeatGeek, and Dice don't fully cover.
 *
 * Key improvements over the previous version:
 * - Parses actual event dates from RA's grouped date-section headers
 * - Uses the unified geocodeWithMapbox() utility (same bbox as the rest of the pipeline)
 * - Runs title normalization and category classification on every event
 * - Runs cross-platform dedup before insert
 * - Sets confidenceScore: 0.6 (scraped, no structured API)
 * - Tracks ingestion status in ingestion_sources table
 * - Integrated into the sync:all orchestrator pipeline
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { events } = await import('../src/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { validateEventDates } = await import('../src/lib/utils/validateEventDates');
  const { normalizeEventTitle } = await import('../src/lib/utils/normalizeEventTitle');
  const { classifyEventCategory } = await import('../src/lib/utils/categorizeEvent');
  const { geocodeWithMapbox } = await import('../src/lib/utils/geocode');
  const { updateIngestionSourceStatus } = await import('../src/lib/db/ingestionService');
  const {
    findCanonicalMatch,
    mergeIntoCanonical,
    buildInitialTicketUrls,
  } = await import('../src/lib/utils/deduplicateAtIngestion');

  console.log('[RA] Starting scrape:', new Date().toISOString());

  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');

  chromium.use(stealth());

  const browser = await chromium.launch({ headless: true });

  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    console.log('[RA] Navigating to RA NYC events...');
    await page.goto('https://ra.co/events/us/newyork', { waitUntil: 'domcontentloaded' });

    // RA renders events grouped under date section headers. We scroll to load more.
    console.log('[RA] Scrolling to load more events...');
    for (let scrollIndex = 0; scrollIndex < 5; scrollIndex++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    console.log('[RA] Extracting event data...');

    /**
     * Extracts events grouped under RA's date section headers.
     * RA renders events as:
     *   <section data-pw-date="2024-06-01">
     *     <article data-tracking-id="event">...</article>
     *     ...
     *   </section>
     *
     * We traverse each section, read the date from the section's data-pw-date
     * attribute (or a visible date heading), then read all event articles within it.
     */
    const rawEvents = await page.evaluate(() => {
      const extracted: Array<{
        raEventId: string;
        title: string;
        venueName: string;
        ticketUrl: string;
        imageUrl: string | null;
        priceStr: string | null;
        dateStr: string | null; // ISO date from data-pw-date attribute
      }> = [];

      // RA wraps each day's events in a section with a date attribute or heading
      // Try multiple selector patterns since RA's markup changes over time
      const dateSections = document.querySelectorAll(
        '[data-pw-date], section:has([data-tracking-id="event"])'
      );

      if (dateSections.length > 0) {
        // Modern RA layout: sections with data-pw-date attribute
        dateSections.forEach((section) => {
          const dateStr =
            section.getAttribute('data-pw-date') ||
            section.querySelector('time')?.getAttribute('datetime') ||
            null;

          const eventItems = section.querySelectorAll('[data-tracking-id="event"]');
          eventItems.forEach((item) => {
            const linkEl = item.querySelector('a[href*="/events/"]');
            const urlPath = linkEl?.getAttribute('href') || '';
            const ticketUrl = urlPath ? `https://ra.co${urlPath}` : '';
            const raEventId = urlPath.split('/').pop() || '';

            if (!raEventId || !ticketUrl) return;

            const titleEl = item.querySelector('h3, [data-testid="event-title"]');
            const title = titleEl?.textContent?.trim() || '';
            if (!title) return;

            const venueEl = item.querySelector('[data-testid="event-venue"], .event-venue');
            const venueName = venueEl?.textContent?.trim() || 'TBA';

            const imgEl = item.querySelector('img');
            const imageUrl = imgEl?.src || null;

            const textElements = Array.from(item.querySelectorAll('div, span'))
              .map((el) => el.textContent?.trim())
              .filter(Boolean) as string[];
            const priceStr =
              textElements.find(
                (text) => text.includes('$') || text.toLowerCase() === 'free'
              ) || null;

            extracted.push({
              raEventId,
              title,
              venueName,
              ticketUrl,
              imageUrl,
              priceStr,
              dateStr,
            });
          });
        });
      } else {
        // Fallback: flat list of events without date sections — use today's date
        const today = new Date().toISOString().split('T')[0];
        const eventItems = document.querySelectorAll('[data-tracking-id="event"]');
        eventItems.forEach((item) => {
          const linkEl = item.querySelector('a[href*="/events/"]');
          const urlPath = linkEl?.getAttribute('href') || '';
          const ticketUrl = urlPath ? `https://ra.co${urlPath}` : '';
          const raEventId = urlPath.split('/').pop() || '';

          if (!raEventId || !ticketUrl) return;

          const titleEl = item.querySelector('h3, [data-testid="event-title"]');
          const title = titleEl?.textContent?.trim() || '';
          if (!title) return;

          const venueEl = item.querySelector('[data-testid="event-venue"], .event-venue');
          const venueName = venueEl?.textContent?.trim() || 'TBA';

          const imgEl = item.querySelector('img');
          const imageUrl = imgEl?.src || null;

          const textElements = Array.from(item.querySelectorAll('div, span'))
            .map((el) => el.textContent?.trim())
            .filter(Boolean) as string[];
          const priceStr =
            textElements.find(
              (text) => text.includes('$') || text.toLowerCase() === 'free'
            ) || null;

          extracted.push({
            raEventId,
            title,
            venueName,
            ticketUrl,
            imageUrl,
            priceStr,
            dateStr: today,
          });
        });
      }

      return extracted;
    });

    console.log(`[RA] Extracted ${rawEvents.length} events. Normalizing and upserting...`);

    for (const raw of rawEvents) {
      if (!raw.title || !raw.raEventId) continue;

      try {
        // ─── Date parsing ────────────────────────────────────────────────────
        // RA events typically start at 11 PM. If we have a date string from the
        // section header, use it. Otherwise default to tonight at 11 PM.
        let startAt: Date;
        if (raw.dateStr) {
          // Build a datetime: date + 23:00 local time as a reasonable default
          // RA is nightlife-centric so 11 PM is a better default than midnight
          startAt = new Date(`${raw.dateStr}T23:00:00`);
          if (isNaN(startAt.getTime())) {
            startAt = new Date();
            startAt.setHours(23, 0, 0, 0);
          }
        } else {
          startAt = new Date();
          startAt.setHours(23, 0, 0, 0);
        }

        const dateValidation = validateEventDates(startAt, null);
        if (!dateValidation.isValid) {
          console.warn(`[RA] Skipping event ${raw.raEventId}: ${dateValidation.rejectionReason}`);
          results.skipped++;
          continue;
        }

        // ─── Title normalization ─────────────────────────────────────────────
        const normalizedTitle = normalizeEventTitle(raw.title) ?? raw.title;

        // ─── Category classification ──────────────────────────────────────────
        // RA is nightlife and music. Skip LLM fallback — keyword scan suffices.
        const category = await classifyEventCategory({
          title: normalizedTitle,
          description: null,
          skipLlmFallback: true,
        });

        // ─── Price parsing ────────────────────────────────────────────────────
        let priceMin: number | null = null;
        let isFree = false;
        if (raw.priceStr) {
          if (raw.priceStr.toLowerCase().includes('free')) {
            isFree = true;
            priceMin = 0;
          } else {
            const priceMatch = raw.priceStr.match(/\$?([\d]+\.?[\d]*)/);
            if (priceMatch) priceMin = parseFloat(priceMatch[1]);
          }
        }

        // ─── Geocoding (unified geocoder, same bbox as the rest of the pipeline)
        let lat: number | null = null;
        let lng: number | null = null;
        let address: string | null = null;

        if (raw.venueName && raw.venueName !== 'TBA') {
          const geocoded = await geocodeWithMapbox(
            raw.venueName,
            `${raw.venueName}, New York City, NY, USA`
          );
          if (geocoded) {
            lat = geocoded.lat;
            lng = geocoded.lng;
            address = geocoded.placeName;
          }
        }

        const eventToInsert = {
          externalId: raw.raEventId,
          sourceType: 'ra_scrape' as const,
          title: normalizedTitle,
          description: null as string | null,
          category,
          imageUrl: raw.imageUrl,
          startAt,
          endAt: dateValidation.sanitizedEndAt,
          venueName: raw.venueName,
          address,
          lat,
          lng,
          isFree,
          priceMin,
          priceMax: null as number | null,
          currency: 'USD',
          ticketUrl: raw.ticketUrl,
          platform: 'Resident Advisor',
          confidenceScore: 0.6,
          rawSource: raw,
          status: 'active' as const,
        };

        const dedupCandidate = {
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

        // ─── Intra-source dedup (same RA event re-scraped) ────────────────────
        const existing = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.externalId, raw.raEventId),
              eq(events.sourceType, 'ra_scrape')
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(events)
            .set({
              ...eventToInsert,
              ticketUrls: buildInitialTicketUrls(dedupCandidate),
            })
            .where(eq(events.id, existing[0].id));
          results.updated++;
        } else {
          // ─── Cross-platform dedup check ────────────────────────────────────
          const dedupResult = await findCanonicalMatch(dedupCandidate);

          if (dedupResult.isMatch && dedupResult.canonicalEventId) {
            const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
            await mergeIntoCanonical(
              dedupResult.canonicalEventId,
              dedupCandidate,
              coreFields,
              dedupResult.shouldUpdateCanonical
            );
            results.skipped++;
          } else {
            await db.insert(events).values({
              ...eventToInsert,
              ticketUrls: buildInitialTicketUrls(dedupCandidate),
            });
            results.inserted++;
          }
        }
      } catch (eventError) {
        console.error(`[RA] Failed to upsert event ${raw.raEventId}:`, eventError);
        results.errors++;
      }
    }

    await updateIngestionSourceStatus('ra_scrape', 'active');

    console.log(
      `[RA] Scrape complete: inserted=${results.inserted}, updated=${results.updated}, ` +
        `skipped=${results.skipped}, errors=${results.errors}`
    );
  } catch (fatalError) {
    console.error('[RA] Fatal error:', fatalError);
    const { updateIngestionSourceStatus: updateStatus } = await import(
      '../src/lib/db/ingestionService'
    );
    await updateStatus('ra_scrape', 'error', String(fatalError));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[RA Scraper] Fatal error:', error);
    process.exit(1);
  });
