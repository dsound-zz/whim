import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db/index';
import { ingestionSources } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
  // Elsewhere Brooklyn moved domains and dropped the .ics path.
  // Squarespace ?format=ical endpoint no longer works on their custom stack.
  // Their Dice integration is the correct source — pause iCal.
  await db.update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'elsewherebrooklyn.com redirects to elsewhere.club which has no iCal. Site uses Dice — pick up via scrape-dice instead.',
    })
    .where(sql`config->>'feedUrl' LIKE '%elsewherebrooklyn%'`);

  // Baby's All Right — /events.ics returns 404, /events?format=ical also 404.
  // Site runs on a custom CMS (not Squarespace/WordPress). No iCal available.
  await db.update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'No iCal feed available. babysallright.com uses a custom CMS with no .ics export. Consider scraping or Songkick.',
    })
    .where(sql`config->>'feedUrl' LIKE '%babysallright%'`);

  // Rough Trade NYC — all /events.ics URL variants return 403 (Cloudflare blocks scraping).
  await db.update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'All roughtrade.com iCal URLs return 403. Cloudflare blocks scraping. Events appear on Songkick/Ticketmaster.',
    })
    .where(sql`config->>'feedUrl' LIKE '%roughtrade%'`);

  // The Bell House — their site is Ticketmaster-powered (tm_id=393383), no iCal feed.
  await db.update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'No iCal feed exists. thebellhouseny.com is Ticketmaster-powered (tm_id=393383). Already covered by Ticketmaster ingestion.',
    })
    .where(sql`config->>'feedUrl' LIKE '%bellhouse%'`);

  // Roulette — roulette.org/events.ics returns 404. WordPress site but no iCal endpoint.
  await db.update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'roulette.org/events.ics returns 404. WordPress site does not expose an iCal feed at this path.',
    })
    .where(sql`config->>'feedUrl' LIKE '%roulette.org%'`);

  console.log('Done — 5 dead iCal feeds paused.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

