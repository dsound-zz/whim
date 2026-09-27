/**
 * One-time cleanup: remove ephemeral nyc_permits "title-as-venue" rows from
 * the venue registry.
 *
 * Background: before sync-nyc-permits.ts gated venue creation to Farmers
 * Market permits, every permit type created a registry venue named after the
 * event title. Generic titles ("Block Party") collapsed unrelated locations
 * into one venue, and the registry's coordinate-trust rule then relocated
 * distinct events onto the first permit's coordinates (24 block parties across
 * three boroughs were pinned to one Bed-Stuy intersection).
 *
 * This script deletes registry venues that:
 *   - are referenced only by nyc_permits events,
 *   - have no Farmers Market events (markets are legitimate recurring venues),
 *   - have no child venues and no ingestion_sources rows.
 * Events pointing at a deleted venue get venue_id = NULL. Their stale
 * coordinates are then repaired by re-running `npm run sync:nyc-permits`
 * (its update path rewrites lat/lng/address from a fresh geocode).
 *
 * Usage:
 *   npx tsx scripts/purge-permit-title-venues.ts            # dry run (default)
 *   npx tsx scripts/purge-permit-title-venues.ts --execute  # apply
 */

import * as dotenv from 'dotenv';
dotenv.config();

const isExecute = process.argv.includes('--execute');

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { events, venues } = await import('../src/db/schema');
  const { sql, inArray } = await import('drizzle-orm');

  const badVenues = await db.execute(sql`
    SELECT v.id, v.name,
           (SELECT count(*) FROM events e WHERE e.venue_id = v.id) AS event_count
    FROM venues v
    WHERE EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id
                      AND e.source_type <> 'nyc_permits')
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id
                      AND e.raw_source->'permit'->>'event_type' = 'Farmers Market')
      AND NOT EXISTS (SELECT 1 FROM venues c WHERE c.parent_venue_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM ingestion_sources s WHERE s.venue_id = v.id)
    ORDER BY event_count DESC
  `);

  const rows = badVenues.rows as { id: string; name: string; event_count: string }[];
  const totalEvents = rows.reduce((sum, r) => sum + Number(r.event_count), 0);

  console.log(`[PurgePermitVenues] ${isExecute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`[PurgePermitVenues] ${rows.length} venues to delete, ${totalEvents} events to detach:`);
  for (const r of rows.slice(0, 40)) {
    console.log(`  - "${r.name}" (${r.event_count} events)`);
  }
  if (rows.length > 40) console.log(`  ... and ${rows.length - 40} more`);

  if (!isExecute) {
    console.log('[PurgePermitVenues] Dry run complete. Re-run with --execute to apply.');
    return;
  }

  // Neon HTTP driver mishandles SQL array params — use inArray by primary key
  // (see pause-dead-ical-feeds.ts for the original lesson).
  const ids = rows.map((r) => r.id);
  await db.update(events).set({ venueId: null }).where(inArray(events.venueId, ids));
  await db.delete(venues).where(inArray(venues.id, ids));
  console.log(
    `[PurgePermitVenues] Detached events and deleted ${ids.length} venues (aliases cascade).`
  );
  console.log('[PurgePermitVenues] Now run: npm run sync:nyc-permits  # repairs coords on future events');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[PurgePermitVenues] Fatal error:', error);
    process.exit(1);
  });
