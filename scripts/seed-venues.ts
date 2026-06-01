import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { venues } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { venueOverrides as overrides } from '@/lib/utils/venueOverrides';

async function run() {
  console.log('Seeding manual venue overrides into the DB...');

  for (const venue of overrides) {
    const existing = await db.select().from(venues).where(eq(venues.name, venue.name));
    if (existing.length > 0) {
      console.log(`Updating existing venue: ${venue.name}`);
      await db.update(venues).set({
        lat: venue.lat,
        lng: venue.lng,
        address: venue.address,
        updatedAt: new Date()
      }).where(eq(venues.name, venue.name));
    } else {
      console.log(`Inserting new venue: ${venue.name}`);
      await db.insert(venues).values({
        name: venue.name,
        address: venue.address,
        lat: venue.lat,
        lng: venue.lng,
      });
    }
  }

  console.log('Done seeding venues!');
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to seed venues:', err);
  process.exit(1);
});
