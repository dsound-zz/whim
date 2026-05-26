import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { venues } from '@/db/schema';
import { eq } from 'drizzle-orm';

const overrides = [
  {
    name: 'Northwell at Jones Beach Theater',
    address: '895 Bay Pkwy, Wantagh, NY 11793',
    lat: 40.6010961,
    lng: -73.4920227,
  },
  {
    name: 'Terminal 5',
    address: '610 W 56th St, New York, NY 10019',
    lat: 40.7697,
    lng: -73.9927,
  },
  {
    name: 'Sultan Room',
    address: '234 Starr St, Brooklyn, NY 11237',
    lat: 40.7071,
    lng: -73.9213,
  },
  {
    name: 'The Roof, Superior Ingredients',
    address: '74 Wythe Ave., 11249, Brooklyn, NY, US',
    lat: 40.722246,
    lng: -73.95774,
  },
  {
    name: 'The Roof at Superior Ingredients',
    address: '74 Wythe Ave., 11249, Brooklyn, NY, US',
    lat: 40.722246,
    lng: -73.95774,
  },
  {
    name: 'Knockdown Center',
    address: '52-19 Flushing Ave, Maspeth, NY 11378',
    lat: 40.7126,
    lng: -73.9018,
  },
  {
    name: 'Mercury Lounge',
    address: '217 E Houston St, New York, NY 10002',
    lat: 40.7222,
    lng: -73.9867,
  }
];

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
