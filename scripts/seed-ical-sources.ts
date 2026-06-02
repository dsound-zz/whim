/**
 * Seed iCal ingestion sources.
 *
 * Populates ingestion_sources with a verified set of NYC venue iCal feeds.
 * Only inserts rows that don't already exist (idempotent — safe to re-run).
 *
 * ─── How to find an iCal feed URL ────────────────────────────────────────────
 *
 * Most venues that expose iCal feeds are running WordPress + The Events Calendar
 * plugin, which generates feeds at:
 *   - /?ical=1
 *   - /events/?ical=1
 *   - /events/category/SLUG/?ical=1  (for category-filtered feeds)
 *
 * Other common patterns:
 *   - /events.ics       (Squarespace, custom calendars)
 *   - /calendar.ics     (iCloud, Exchange-based)
 *   - /feed/ical        (some custom plugins)
 *
 * Verification steps before adding:
 *   1. curl -sI "URL" | grep content-type
 *      → Must return: text/calendar OR application/ics OR application/octet-stream
 *      → OR: curl -sL "URL" | head -1 must return "BEGIN:VCALENDAR"
 *   2. curl -sL "URL" | grep -c "BEGIN:VEVENT"
 *      → Should return > 0 events
 *   3. Test via: npm run sync:ical -- --url "URL"
 *
 * ─── Adding more sources ──────────────────────────────────────────────────────
 * 1. Find the .ics URL using the verification steps above
 * 2. Add an entry to ICAL_SOURCES below
 * 3. Re-run: npm run seed:ical-sources
 * 4. Run: npm run sync:ical to pull events immediately
 */

import * as dotenv from 'dotenv';
dotenv.config();

interface ICalSourceSeed {
  /** Short human-readable name for the venue / calendar */
  venueName: string;
  /** The .ics feed URL — must be verified before adding */
  feedUrl: string;
}

/**
 * Verified NYC venue/org iCal feeds.
 *
 * All URLs below have been confirmed to return valid iCal content
 * with BEGIN:VCALENDAR and real VEVENT entries.
 *
 * Sources NOT covered by Ticketmaster/SeatGeek/Dice/Eventbrite are prioritized.
 */
const ICAL_SOURCES: ICalSourceSeed[] = [
  // ─── City Parks Foundation ─────────────────────────────────────────────────
  // Free outdoor concerts, performances, and community events in NYC parks.
  // This fills the gap between NYC Parks API (government) and the commercial
  // ticketed venues. CPF events are hyperlocal, free, and underrepresented.
  {
    venueName: 'City Parks Foundation',
    feedUrl: 'https://www.cityparksfoundation.org/events/?ical=1',
  },

  // ─── Add verified feeds here ───────────────────────────────────────────────
  // Use the verification steps in the file header before adding.
  //
  // Template:
  // {
  //   venueName: 'Venue Name',
  //   feedUrl: 'https://venue.com/events/?ical=1',
  // },
];

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { ingestionSources } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');

  console.log('=====================================');
  console.log(' Seeding iCal Ingestion Sources     ');
  console.log('=====================================\n');

  let inserted = 0;
  let skipped = 0;

  for (const source of ICAL_SOURCES) {
    // Check if this feed URL already exists in the DB (active or paused)
    const allIcalSources = await db
      .select({ id: ingestionSources.id, config: ingestionSources.config, syncStatus: ingestionSources.syncStatus })
      .from(ingestionSources)
      .where(eq(ingestionSources.type, 'ical'));

    const existingRow = allIcalSources.find((row) => {
      const config = row.config as Record<string, unknown> | null;
      return config?.feedUrl === source.feedUrl;
    });

    if (existingRow) {
      if (existingRow.syncStatus === 'paused') {
        // Re-activate a previously paused source with an updated URL
        await db
          .update(ingestionSources)
          .set({ syncStatus: 'active', errorMessage: null })
          .where(eq(ingestionSources.id, existingRow.id));
        console.log(`[seed] REACTIVATED ${source.venueName}`);
        inserted++;
      } else {
        console.log(`[seed] SKIP  ${source.venueName} (already active)`);
        skipped++;
      }
      continue;
    }

    await db.insert(ingestionSources).values({
      type: 'ical',
      syncStatus: 'active',
      config: {
        feedUrl: source.feedUrl,
        defaultVenueName: source.venueName,
      },
    });

    console.log(`[seed] INSERT ${source.venueName}`);
    console.log(`       Feed: ${source.feedUrl}`);
    inserted++;
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Done: ${inserted} inserted/reactivated, ${skipped} skipped`);
  console.log(`\nRun "npm run sync:ical" to pull events from these feeds.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[seed-ical-sources] Fatal error:', error);
    process.exit(1);
  });
