import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { eq, ilike } from 'drizzle-orm';

async function run() {
  console.log('Fetching venue overrides from DB...');
  const activeVenues = await db.select().from(venues);
  console.log(`Found ${activeVenues.length} venue overrides.`);

  for (const venue of activeVenues) {
    if (!venue.lat || !venue.lng) {
      console.log(`Skipping venue ${venue.name} due to missing coordinates.`);
      continue;
    }

    console.log(`Syncing events for venue: "${venue.name}"...`);
    
    // Update all events with the correct venue details
    const result = await db.update(events)
      .set({
        lat: venue.lat,
        lng: venue.lng,
        address: venue.address,
        updatedAt: new Date()
      })
      .where(ilike(events.venueName, venue.name));

    // Drizzle with neon http client returns the result count in different ways depending on driver
    console.log(`Updated events for "${venue.name}" to Lat: ${venue.lat}, Lng: ${venue.lng}`);
  }

  console.log('Event sync complete.');
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to sync events:', err);
  process.exit(1);
});
