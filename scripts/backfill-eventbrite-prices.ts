/**
 * Backfill price data for existing Eventbrite events.
 *
 * Events ingested before the price-extraction fix have priceMin/priceMax = null
 * even though the rawSource.ticket_availability field contains correct prices.
 * This script reads rawSource for all Eventbrite events with null prices and
 * patches the DB rows.
 *
 * Run: npx ts-node -r tsconfig-paths/register --project tsconfig.scripts.json scripts/backfill-eventbrite-prices.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { events } = await import('../src/db/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  console.log('[backfill-prices] Fetching Eventbrite events with null priceMin...');

  const eventbriteEvents = await db
    .select({
      id: events.id,
      title: events.title,
      isFree: events.isFree,
      rawSource: events.rawSource,
    })
    .from(events)
    .where(
      and(
        eq(events.sourceType, 'eventbrite_api'),
        isNull(events.priceMin),
        eq(events.isFree, false)
      )
    );

  console.log(`[backfill-prices] Found ${eventbriteEvents.length} events to potentially backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const eventRow of eventbriteEvents) {
    const rawSource = eventRow.rawSource as Record<string, unknown> | null;
    if (!rawSource) {
      skipped++;
      continue;
    }

    const ticketAvailability = rawSource.ticket_availability as Record<string, unknown> | undefined;
    const minPriceStr = (ticketAvailability?.minimum_ticket_price as Record<string, unknown> | undefined)
      ?.major_value as string | undefined;
    const maxPriceStr = (ticketAvailability?.maximum_ticket_price as Record<string, unknown> | undefined)
      ?.major_value as string | undefined;

    if (!minPriceStr && !maxPriceStr) {
      skipped++;
      continue;
    }

    const parsedPriceMin = minPriceStr ? parseFloat(minPriceStr) : null;
    const parsedPriceMax = maxPriceStr ? parseFloat(maxPriceStr) : null;

    // If min is 0 it's actually free
    const isEventFree = parsedPriceMin !== null && parsedPriceMin === 0;

    await db
      .update(events)
      .set({
        isFree: isEventFree,
        priceMin: isEventFree ? null : parsedPriceMin,
        priceMax: isEventFree ? null : parsedPriceMax,
        currency: (rawSource.currency as string) ?? 'USD',
      })
      .where(eq(events.id, eventRow.id));

    updated++;
  }

  console.log(`[backfill-prices] Done: ${updated} updated, ${skipped} skipped (no price data in rawSource).`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[backfill-prices] Fatal error:', error);
    process.exit(1);
  });
