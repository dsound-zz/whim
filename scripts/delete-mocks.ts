import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { inArray } from 'drizzle-orm';

async function run() {
  console.log('Deleting mock events from the DB...');
  
  try {
    const result = await db.delete(events).where(inArray(events.externalId, ['mock-1', 'mock-2', 'tm-duplicate-12345'])).returning({ id: events.id });
    
    console.log(`Successfully deleted ${result.length} mock events.`);
  } catch (error) {
    console.error('Failed to delete mock events:', error);
  }
  
  process.exit(0);
}

run();
