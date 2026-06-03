/**
 * audit-data-quality.ts
 *
 * Standalone CLI script for batch data quality auditing.
 * Can be run manually or scheduled as a Railway cron.
 *
 * Usage:
 *   npm run audit:quality                           # Audit 50 events
 *   npm run audit:quality -- --limit 100            # Audit 100 events
 *   npm run audit:quality -- --fix-stale            # Auto-expire stale events
 *   npm run audit:quality -- --source ticketmaster_api
 *   npm run audit:quality -- --dry-run              # Report only, no DB writes
 */

import * as dotenv from 'dotenv';
dotenv.config();

// DB and service imports must come AFTER dotenv so DATABASE_URL is available
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auditEventQuality } from '@/lib/verification/auditEventQuality';
import {
  fetchStaleActiveEvents,
  bulkUpdateEventStatus,
  updateEventConfidenceScore,
} from '@/lib/db/auditQueries';

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1 || flagIndex + 1 >= args.length) return undefined;
  return args[flagIndex + 1];
}

const limitValue = parseInt(getArgValue('--limit') ?? '50', 10);
const shouldFixStale = args.includes('--fix-stale');
const isDryRun = args.includes('--dry-run');
const sourceFilter = getArgValue('--source');

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        Whim — Data Quality Audit            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Limit:      ${limitValue}`);
  console.log(`  Fix stale:  ${shouldFixStale}`);
  console.log(`  Dry run:    ${isDryRun}`);
  console.log(`  Source:     ${sourceFilter ?? 'all'}`);
  console.log('');

  const startTime = Date.now();

  // Step 1: Handle stale events
  console.log('─── Step 1: Stale Event Cleanup ───');
  const staleEvents = await fetchStaleActiveEvents(500);
  console.log(`  Found ${staleEvents.length} stale active events`);

  if (staleEvents.length > 0 && shouldFixStale && !isDryRun) {
    const staleIds = staleEvents.map((eventRow) => eventRow.id);
    const expiredCount = await bulkUpdateEventStatus(staleIds, 'expired');
    console.log(`  ✓ Expired ${expiredCount} stale events`);
  } else if (staleEvents.length > 0 && shouldFixStale && isDryRun) {
    console.log(`  [DRY RUN] Would expire ${staleEvents.length} stale events`);
  }

  // Step 2: Audit active events
  console.log('\n─── Step 2: Quality Audit ───');

  const whereConditions = [eq(events.status, 'active')];
  if (sourceFilter) {
    whereConditions.push(eq(events.sourceType, sourceFilter as any));
  }

  const candidateEvents = await db
    .select()
    .from(events)
    .where(and(...whereConditions))
    .orderBy(events.startAt)
    .limit(limitValue);

  console.log(`  Auditing ${candidateEvents.length} events...\n`);

  let totalScore = 0;
  let failedChecks = {
    stale: 0,
    missingFields: 0,
    coordinates: 0,
    price: 0,
    duplicates: 0,
  };
  let passedCount = 0;

  for (let eventIndex = 0; eventIndex < candidateEvents.length; eventIndex++) {
    const event = candidateEvents[eventIndex];
    const auditResult = await auditEventQuality(event);
    totalScore += auditResult.overallScore;

    // Track failures
    if (!auditResult.checks.staleEvent.passed) failedChecks.stale++;
    if (!auditResult.checks.missingFields.passed) failedChecks.missingFields++;
    if (!auditResult.checks.coordinateAccuracy.passed) failedChecks.coordinates++;
    if (!auditResult.checks.priceSanity.passed) failedChecks.price++;
    if (!auditResult.checks.duplicateSuspect.passed) failedChecks.duplicates++;

    if (auditResult.overallScore === 100) passedCount++;

    // Update confidence score in DB
    if (!isDryRun) {
      await updateEventConfidenceScore(
        event.id,
        auditResult.overallScore / 100
      );
    }

    // Progress indicator every 10 events
    if ((eventIndex + 1) % 10 === 0 || eventIndex === candidateEvents.length - 1) {
      process.stdout.write(
        `  [${eventIndex + 1}/${candidateEvents.length}] avg score: ${Math.round(totalScore / (eventIndex + 1))}/100\r`
      );
    }

    // Brief throttle to avoid hammering Mapbox
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log('\n');

  // Summary
  const averageScore = candidateEvents.length > 0
    ? Math.round(totalScore / candidateEvents.length)
    : 0;

  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('─── Summary ───');
  console.log(`  Events audited:     ${candidateEvents.length}`);
  console.log(`  Perfect score:      ${passedCount}`);
  console.log(`  Average score:      ${averageScore}/100`);
  console.log(`  Duration:           ${durationSeconds}s`);
  console.log('');
  console.log('  Failed checks breakdown:');
  console.log(`    Stale events:     ${failedChecks.stale}`);
  console.log(`    Missing fields:   ${failedChecks.missingFields}`);
  console.log(`    Bad coordinates:  ${failedChecks.coordinates}`);
  console.log(`    Price issues:     ${failedChecks.price}`);
  console.log(`    Duplicate suspects: ${failedChecks.duplicates}`);

  if (isDryRun) {
    console.log('\n  [DRY RUN] No database changes were made.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error during audit:', error);
  process.exit(1);
});
