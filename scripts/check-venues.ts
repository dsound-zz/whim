import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { ilike } from 'drizzle-orm';

async function run() {
  const evs = await db.select({
    title: events.title,
    venueName: events.venueName,
    address: events.address
  }).from(events).where(ilike(events.venueName, '%Superior Ingredients%')).limit(5);

  console.log(evs);
  process.exit(0);
}

run();
