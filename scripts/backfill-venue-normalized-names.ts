import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { venues } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { normalizeVenueName } from '@/lib/utils/normalizeVenueName';

/**
 * One-time backfill: populate `venues.normalized_name` for rows created before
 * the venue registry existed (the manual seed overrides). Without this, the
 * resolver's exact-match step can't hit the seeded coordinate overrides.
 *
 * Idempotent — safe to re-run; recomputes the normalized form each time.
 */
async function run(): Promise<void> {
  const allVenues = await db.select({ id: venues.id, name: venues.name }).from(venues);
  console.log(`[Backfill] Normalizing ${allVenues.length} venue names...`);

  let updated = 0;
  const seenNormalized = new Map<string, string>(); // normalized → first venue name (collision detection)

  for (const venue of allVenues) {
    const normalized = normalizeVenueName(venue.name);
    if (!normalized) {
      console.warn(`[Backfill] Venue ${venue.id} ("${venue.name}") normalized to empty — skipping.`);
      continue;
    }
    if (seenNormalized.has(normalized)) {
      console.warn(
        `[Backfill] Collision: "${venue.name}" and "${seenNormalized.get(normalized)}" ` +
        `both normalize to "${normalized}". Both keep the value; dedupe in a later slice.`
      );
    } else {
      seenNormalized.set(normalized, venue.name);
    }

    await db.update(venues).set({ normalizedName: normalized }).where(eq(venues.id, venue.id));
    updated++;
  }

  console.log(`[Backfill] Done. Updated ${updated} venues; ${seenNormalized.size} distinct normalized names.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[Backfill] Fatal error:', error);
    process.exit(1);
  });
