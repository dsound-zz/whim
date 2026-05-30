import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, isNotNull, and } from 'drizzle-orm';
import { geocodeWithMapbox } from '@/lib/utils/geocode';

/**
 * Calculates distance between two coordinates in miles using the Haversine formula
 */
function getDistanceFromLatLonInMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in miles
  return d;
}

async function run() {
  console.log('Fetching distinct venues from Songkick events...');
  
  // Get all songkick events with distinct venues
  const allEvents = await db.select({
    venueName: events.venueName,
    address: events.address,
  })
  .from(events)
  .where(eq(events.sourceType, 'songkick_scrape'));

  // Deduplicate by venueName
  const uniqueVenuesMap = new Map();
  for (const event of allEvents) {
    if (event.venueName && !uniqueVenuesMap.has(event.venueName)) {
      uniqueVenuesMap.set(event.venueName, event.address);
    }
  }

  const uniqueVenues = Array.from(uniqueVenuesMap.entries()).map(([name, address]) => ({ name, address }));
  console.log(`Found ${uniqueVenues.length} unique venues. Testing geocoding...`);

  const results = [];
  const nycLat = 40.7128;
  const nycLng = -74.0060;

  for (const venue of uniqueVenues) {
    const geocodeQuery = `${venue.name}, ${venue.address}`;
    const geocoded = await geocodeWithMapbox(venue.name, geocodeQuery);
    
    if (geocoded) {
      const distance = getDistanceFromLatLonInMiles(nycLat, nycLng, geocoded.lat, geocoded.lng);
      const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${geocoded.lat},${geocoded.lng}`;
      
      results.push({
        Venue: venue.name,
        Address: venue.address,
        Lat: geocoded.lat.toFixed(4),
        Lng: geocoded.lng.toFixed(4),
        'Dist (mi)': distance.toFixed(1),
        MapLink: googleMapsLink
      });
    } else {
      results.push({
        Venue: venue.name,
        Address: venue.address,
        Lat: 'NULL',
        Lng: 'NULL',
        'Dist (mi)': 'NULL',
        MapLink: 'FAILED'
      });
    }
    
    // Slight delay to respect rate limits
    await new Promise(res => setTimeout(res, 100));
  }

  // Sort by distance ascending
  results.sort((a, b) => {
    if (a['Dist (mi)'] === 'NULL') return 1;
    if (b['Dist (mi)'] === 'NULL') return -1;
    return parseFloat(a['Dist (mi)']) - parseFloat(b['Dist (mi)']);
  });

  console.table(results);
  console.log(`\nTested ${results.length} venues.`);
  
  process.exit(0);
}

run().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
