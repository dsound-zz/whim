import * as dotenv from 'dotenv';
dotenv.config();

import { resolveVenue } from '@/lib/db/venueService';

/**
 * Verification harness for the venue resolver. Feeds real, fragmented venue-name
 * variants (pulled from the live events table) through resolveVenue() and reports
 * how many distinct canonical venues they collapse to. Idempotent-ish: it creates
 * canonical venues + aliases on first run, which is the intended behavior.
 */

// The 8 Elsewhere variants that share the real coordinate cluster, plus one
// mis-geocoded outlier ("The Hall, Elsewhere" at Rockaway) to show the boundary.
const ELSEWHERE_VARIANTS = [
  { name: 'Elsewhere', lat: 40.7094, lng: -73.9234 },
  { name: 'Elsewhere - Zone One', lat: 40.70941, lng: -73.92317 },
  { name: 'Zone One, Elsewhere', lat: 40.7094, lng: -73.9234 },
  { name: 'Elsewhere - The Hall', lat: 40.70941, lng: -73.92317 },
  { name: 'The Rooftop, Elsewhere', lat: 40.7094, lng: -73.9234 },
  { name: 'Elsewhere - The Rooftop', lat: 40.70941, lng: -73.92317 },
  { name: 'Chatroom at Elsewhere', lat: 40.7094, lng: -73.92323 },
  { name: 'The Hall, Elsewhere', lat: 40.6082, lng: -73.7203 }, // mis-geocoded outlier
];

// Control: a genuinely different venue near the cluster — must NOT merge into Elsewhere.
const CONTROL = { name: "Honey's", lat: 40.7101, lng: -73.9245 };

async function run(): Promise<void> {
  console.log('=== Venue Resolver Smoke Test ===\n');
  const collapsed = new Map<string, string[]>(); // venueId → input names

  for (const variant of [...ELSEWHERE_VARIANTS, CONTROL]) {
    const resolved = await resolveVenue({
      name: variant.name,
      lat: variant.lat,
      lng: variant.lng,
      sourceType: 'smoke_test',
    });
    if (!resolved) {
      console.log(`  ${variant.name.padEnd(26)} → (unresolved)`);
      continue;
    }
    console.log(
      `  ${variant.name.padEnd(26)} → venue=${resolved.venueId.slice(0, 8)} ` +
      `canonical="${resolved.canonicalName}" via ${resolved.matchedBy}`
    );
    const list = collapsed.get(resolved.venueId) ?? [];
    list.push(variant.name);
    collapsed.set(resolved.venueId, list);
  }

  console.log(`\n=== Result: ${ELSEWHERE_VARIANTS.length + 1} inputs → ${collapsed.size} canonical venues ===`);
  for (const [venueId, names] of collapsed) {
    console.log(`  venue ${venueId.slice(0, 8)}: ${names.join(' | ')}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Smoke test failed:', error);
    process.exit(1);
  });
