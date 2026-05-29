/**
 * run-integrity-check.ts
 *
 * Standalone cron script that batches through active future events and runs
 * the event integrity smoke test on each one.
 *
 * Usage:
 *   npm run verify:integrity
 *   npm run verify:integrity -- --limit 20     # check only 20 events
 *   npm run verify:integrity -- --source nyc_parks_api  # filter by source
 *
 * Deployment: Railway cron, nightly (or on-demand via admin panel).
 */

import 'dotenv/config';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, gt, and, inArray } from 'drizzle-orm';
import { verifyEventIntegrity } from '@/lib/verification/verifyEventIntegrity';
import { saveVerificationLog } from '@/lib/db/verificationService';
import type { EventData } from '@/types/verification';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): { limit: number; sourceType: string | null } {
  const args = process.argv.slice(2);
  let limit = 50;
  let sourceType: string | null = null;

  for (let argIndex = 0; argIndex < args.length; argIndex++) {
    if (args[argIndex] === '--limit' && args[argIndex + 1]) {
      limit = parseInt(args[argIndex + 1], 10);
    }
    if (args[argIndex] === '--source' && args[argIndex + 1]) {
      sourceType = args[argIndex + 1];
    }
  }

  return { limit, sourceType };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  const { limit, sourceType } = parseArgs();

  console.log(`[IntegrityCheck] Starting run — limit: ${limit}, source filter: ${sourceType ?? 'all'}`);

  // ── Fetch candidate events ──────────────────────────────────────────────────
  const now = new Date();

  const whereConditions = [
    eq(events.status, 'active'),
    gt(events.startAt, now),
  ];

  if (sourceType) {
    whereConditions.push(eq(events.sourceType, sourceType as any));
  }

  const candidateEvents = await db
    .select({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      venueName: events.venueName,
      address: events.address,
      lat: events.lat,
      lng: events.lng,
      ticketUrl: events.ticketUrl,
      sourceType: events.sourceType,
    })
    .from(events)
    .where(and(...whereConditions))
    .orderBy(events.startAt)
    .limit(limit);

  console.log(`[IntegrityCheck] Found ${candidateEvents.length} events to check`);

  // ── Run checks ──────────────────────────────────────────────────────────────
  let countVerified = 0;
  let countFlagged = 0;
  let countSkipped = 0;
  let countErrors = 0;

  for (const candidateEvent of candidateEvents) {
    const eventData: EventData = {
      id: candidateEvent.id,
      title: candidateEvent.title,
      startAt: candidateEvent.startAt,
      venueName: candidateEvent.venueName,
      address: candidateEvent.address,
      lat: candidateEvent.lat,
      lng: candidateEvent.lng,
      ticketUrl: candidateEvent.ticketUrl,
      sourceType: candidateEvent.sourceType,
    };

    try {
      console.log(`[IntegrityCheck] Checking: "${candidateEvent.title}" (${candidateEvent.id})`);

      const verificationResult = await verifyEventIntegrity(eventData);
      await saveVerificationLog(verificationResult);

      switch (verificationResult.status) {
        case 'verified':
          countVerified++;
          break;
        case 'skipped':
          countSkipped++;
          break;
        case 'error':
          countErrors++;
          console.warn(`[IntegrityCheck] Error for event ${candidateEvent.id}: ${verificationResult.errorMessage}`);
          break;
        default:
          // Any flagged_* status
          countFlagged++;
          console.warn(
            `[IntegrityCheck] FLAGGED (${verificationResult.status}): "${candidateEvent.title}" — ${verificationResult.mismatchReason}`
          );
      }
    } catch (unexpectedError) {
      // saveVerificationLog itself threw — log and continue
      countErrors++;
      console.error(
        `[IntegrityCheck] Unexpected error processing event ${candidateEvent.id}:`,
        unexpectedError
      );
    }

    // Throttle: avoid rate-limiting Gemini and Mapbox APIs.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
[IntegrityCheck] ── Run complete ─────────────────────────
  Duration:  ${durationSeconds}s
  Checked:   ${candidateEvents.length}
  Verified:  ${countVerified}
  Flagged:   ${countFlagged}
  Skipped:   ${countSkipped}
  Errors:    ${countErrors}
──────────────────────────────────────────────────────────
  `);
}

main().catch((err) => {
  console.error('[IntegrityCheck] Fatal error:', err);
  process.exit(1);
});
