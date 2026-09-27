/**
 * Smoke test for the paginated event query contract.
 *
 * Walks every page of a citywide query and asserts the three properties a B2B
 * consumer depends on:
 *   1. `total` equals the number of events actually obtainable by paging.
 *   2. No event id is returned on more than one page.
 *   3. Paging reaches every event exactly once (no silent gaps).
 *
 * Before collapsing was moved ahead of pagination, `total` counted pre-collapse
 * rows (~4x overstated) and `offset` advanced over raw rows while pages carried
 * collapsed ones, so pages overlapped and events went missing.
 *
 * Usage: npx tsx -r dotenv/config -r tsconfig-paths/register scripts/smoke-pagination.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

const NYC = { minLat: 40.4774, maxLat: 40.9176, minLng: -74.2591, maxLng: -73.7004 };
const PAGE_SIZE = 25;

async function main(): Promise<void> {
  const { fetchEventsNearLocation } = await import('@/lib/db/eventService');

  const first = await fetchEventsNearLocation({ ...NYC, limit: PAGE_SIZE, offset: 0 });
  const total = first.total;
  console.log(`[Pagination] total reported: ${total}`);

  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  let pages = 0;

  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const page = await fetchEventsNearLocation({ ...NYC, limit: PAGE_SIZE, offset });
    pages++;
    for (const event of page.events) {
      if (seen.has(event.id)) duplicates.push(event.id);
      else seen.set(event.id, offset);
    }
    if (page.total !== total) {
      console.error(`[Pagination] FAIL: total changed between pages (${total} -> ${page.total})`);
      process.exitCode = 1;
    }
  }

  console.log(`[Pagination] walked ${pages} pages, collected ${seen.size} unique events`);

  let failed = false;

  if (duplicates.length > 0) {
    console.error(`[Pagination] FAIL: ${duplicates.length} event(s) appeared on more than one page`);
    console.error(`  e.g. ${duplicates.slice(0, 3).join(', ')}`);
    failed = true;
  } else {
    console.log('[Pagination] PASS: no event appeared on two pages');
  }

  if (seen.size !== total) {
    console.error(`[Pagination] FAIL: paging yielded ${seen.size} events but total claims ${total}`);
    failed = true;
  } else {
    console.log('[Pagination] PASS: paging yielded exactly `total` events');
  }

  // A page in the middle must be reproducible.
  const midOffset = Math.min(PAGE_SIZE * 2, Math.max(total - PAGE_SIZE, 0));
  const a = await fetchEventsNearLocation({ ...NYC, limit: PAGE_SIZE, offset: midOffset });
  const b = await fetchEventsNearLocation({ ...NYC, limit: PAGE_SIZE, offset: midOffset });
  const stable = a.events.map((e) => e.id).join(',') === b.events.map((e) => e.id).join(',');
  console.log(stable ? '[Pagination] PASS: repeated page is stable' : '[Pagination] FAIL: page not stable');
  if (!stable) failed = true;

  if (failed) process.exitCode = 1;
  else console.log('\n[Pagination] All checks passed.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error('[Pagination] Fatal error:', error);
    process.exit(1);
  });
