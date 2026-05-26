import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { lt, or, sql } from 'drizzle-orm';

async function run() {
  console.log('Running event expiration cleanup job...');
  
  try {
    const result = await db.update(events).set({ status: 'expired' }).where(
      or(
        lt(events.endAt, new Date()), // If endAt is in the past
        // Or if there is no endAt, but startAt is more than 4 hours ago
        lt(events.startAt, new Date(Date.now() - 4 * 60 * 60 * 1000))
      )
    ).returning({ id: events.id });
    
    console.log(`Successfully expired ${result.length} past events.`);
  } catch (error) {
    console.error('Failed to cleanup events:', error);
  }
  
  process.exit(0);
}

run();
