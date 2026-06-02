/**
 * Standalone iCal feed sync script.
 *
 * Reads all active iCal ingestion sources from the ingestion_sources table
 * and runs ingestICalFeed() for each one sequentially.
 *
 * Usage:
 *   npm run sync:ical                              # Sync all active feeds
 *   npm run sync:ical -- --url <feedUrl>           # Ad-hoc single feed test
 *   npm run sync:ical -- --id <sourceId>           # Single source by DB id
 */

import * as dotenv from 'dotenv';
dotenv.config();

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const singleUrl = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const singleId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { ingestionSources } = await import('../src/db/schema');
  const { eq, and, ne } = await import('drizzle-orm');
  const { ingestICalFeed } = await import('../src/lib/ical/ingest');

  console.log('=====================================');
  console.log('   Whim iCal Feed Sync              ');
  console.log('=====================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  // ─── Resolve which sources to process ──────────────────────────────────────

  type ICalSourceRow = {
    id: string;
    config: unknown;
  };

  let sourcesToProcess: ICalSourceRow[] = [];

  if (singleUrl) {
    // Ad-hoc single feed test — no DB lookup needed
    console.log(`[sync-ical] Ad-hoc mode: testing single URL: ${singleUrl}`);
    sourcesToProcess = [
      {
        id: 'adhoc',
        config: { feedUrl: singleUrl, defaultVenueName: 'Unknown Venue' },
      },
    ];
  } else if (singleId) {
    // Single source by DB id
    const rows = await db
      .select({ id: ingestionSources.id, config: ingestionSources.config })
      .from(ingestionSources)
      .where(eq(ingestionSources.id, singleId))
      .limit(1);

    if (rows.length === 0) {
      console.error(`[sync-ical] No ingestion source found with id: ${singleId}`);
      process.exit(1);
    }
    sourcesToProcess = rows;
  } else {
    // Normal mode: query all active iCal sources from the DB
    sourcesToProcess = await db
      .select({ id: ingestionSources.id, config: ingestionSources.config })
      .from(ingestionSources)
      .where(
        and(
          eq(ingestionSources.type, 'ical'),
          ne(ingestionSources.syncStatus, 'paused')
        )
      );
  }

  if (sourcesToProcess.length === 0) {
    console.log('[sync-ical] No active iCal sources found. Run scripts/seed-ical-sources.ts to add feeds.');
    process.exit(0);
  }

  console.log(`[sync-ical] Processing ${sourcesToProcess.length} iCal feed(s)...\n`);

  // ─── Process each source ───────────────────────────────────────────────────

  const summary: Array<{
    feedUrl: string;
    status: 'SUCCESS' | 'FAILED';
    inserted: number;
    updated: number;
    merged: number;
    errors: number;
    durationMs: number;
  }> = [];

  let hasAnyFailure = false;

  for (const sourceRow of sourcesToProcess) {
    const config = sourceRow.config as Record<string, unknown> | null;
    const feedUrl = typeof config?.feedUrl === 'string' ? config.feedUrl : null;
    const defaultVenueName =
      typeof config?.defaultVenueName === 'string'
        ? config.defaultVenueName
        : 'Unknown Venue';

    if (!feedUrl) {
      console.error(
        `[sync-ical] Source ${sourceRow.id} has no feedUrl in config — skipping.`
      );
      summary.push({
        feedUrl: '(missing)',
        status: 'FAILED',
        inserted: 0,
        updated: 0,
        merged: 0,
        errors: 1,
        durationMs: 0,
      });
      hasAnyFailure = true;
      continue;
    }

    console.log(`\n─── Syncing: ${feedUrl}`);
    try {
      const result = await ingestICalFeed({
        id: sourceRow.id,
        feedUrl,
        defaultVenueName,
      });

      summary.push({
        feedUrl,
        status: result.errors > 0 ? 'FAILED' : 'SUCCESS',
        inserted: result.eventsInserted,
        updated: result.eventsUpdated,
        merged: result.eventsMerged,
        errors: result.errors,
        durationMs: result.durationMs,
      });

      if (result.errors > 0) hasAnyFailure = true;
    } catch (fatalError) {
      console.error(`[sync-ical] Fatal error for ${feedUrl}:`, fatalError);
      summary.push({
        feedUrl,
        status: 'FAILED',
        inserted: 0,
        updated: 0,
        merged: 0,
        errors: 1,
        durationMs: 0,
      });
      hasAnyFailure = true;
    }
  }

  // ─── Summary report ────────────────────────────────────────────────────────

  console.log('\n=====================================');
  console.log(' iCal Sync Summary');
  console.log('=====================================');
  console.table(
    summary.map((row) => ({
      Feed: row.feedUrl.length > 50 ? `...${row.feedUrl.slice(-47)}` : row.feedUrl,
      Status: row.status,
      Inserted: row.inserted,
      Updated: row.updated,
      Merged: row.merged,
      Errors: row.errors,
      'Duration (ms)': row.durationMs,
    }))
  );

  const totalInserted = summary.reduce((acc, row) => acc + row.inserted, 0);
  const totalUpdated = summary.reduce((acc, row) => acc + row.updated, 0);
  const totalMerged = summary.reduce((acc, row) => acc + row.merged, 0);

  console.log(
    `\nTotal: inserted=${totalInserted}, updated=${totalUpdated}, merged=${totalMerged}`
  );

  process.exit(hasAnyFailure ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error('[sync-ical] Unhandled fatal error:', error);
  process.exit(1);
});
