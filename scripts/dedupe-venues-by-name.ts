import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { venues, events } from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import { mergeVenuesInto } from '@/lib/db/venueService';
import { tokenizeVenueName } from '@/lib/utils/normalizeVenueName';
import { calculateDistanceMeters } from '@/lib/utils/calculateDistance';

/**
 * Name-aware venue merge — catches same-venue fragments that proximity matching
 * misses because one copy is MIS-GEOCODED (so the coordinates disagree even
 * though it's the same place). E.g. "Richard Rodgers Theatre-NY" was geocoded
 * 287m onto Lyric Theatre, so the registry kept it separate from "Richard
 * Rodgers Theatre"; by name it is unambiguously the same venue.
 *
 * Rule (high precision, distance-independent): merge B into A when every token
 * of A's name is contained in B's name AND A has >= 2 tokens (avoids merging on
 * a single generic shared word). The more-general name (fewer tokens) is
 * canonical, so its coordinates — the correct ones — win.
 *
 * Dry-run by default; --apply performs the merges. Review the dry-run output
 * before applying: this trusts names over coordinates, so eyeball each pair.
 */

const APPLY = process.argv.includes('--apply');
// Require the more-general name to be quite specific (>= 3 tokens). At 2 tokens,
// generic names like "New York", "Block Party", "Pier A Park" (many from
// nyc_permits using event titles as venue names) become false-merge magnets.
const MIN_SMALLER_TOKENS = 3;
// Even at 3 tokens, generic permit titles ("Annual Block Party") magnet many
// DIFFERENT block parties. Require the pair to also be geographically close:
// loose enough to catch a mild mis-geocode (Richard Rodgers-NY is 287m off),
// tight enough to exclude block parties spread across the city.
const MAX_MERGE_METERS = 500;

interface V {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  tokens: Set<string>;
}

function isSubset(small: Set<string>, large: Set<string>): boolean {
  if (small.size < MIN_SMALLER_TOKENS || small.size >= large.size) return false;
  for (const token of small) if (!large.has(token)) return false;
  return true;
}

function withinRange(a: V, b: V): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  return calculateDistanceMeters(a.lat, a.lng, b.lat, b.lng) <= MAX_MERGE_METERS;
}

// nyc_permits uses the event title as the venue name, so ephemeral permit titles
// ("Annual Block Party", "Family Day") aren't real venues and must never be a
// merge canonical — two different block parties are not the same place.
const GENERIC_PERMIT_TITLE = /block party|family (and friends )?day|farmers? market|open streets?/i;

function isGenericPermitTitle(name: string): boolean {
  return GENERIC_PERMIT_TITLE.test(name);
}

async function run(): Promise<void> {
  const rows = await db
    .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
    .from(venues);
  const all: V[] = rows.map((row) => ({ ...row, tokens: tokenizeVenueName(row.name) }));

  // Fewest tokens first → buildings/general names become canonical.
  all.sort((a, b) => a.tokens.size - b.tokens.size);

  const canonicalOf = new Map<string, string>();
  for (let i = 0; i < all.length; i++) {
    const canonical = all[i];
    if (canonicalOf.has(canonical.id)) continue;
    if (isGenericPermitTitle(canonical.name)) continue; // never merge into a permit-title venue
    for (let j = 0; j < all.length; j++) {
      if (i === j) continue;
      const other = all[j];
      if (canonicalOf.has(other.id)) continue;
      if (isSubset(canonical.tokens, other.tokens) && withinRange(canonical, other)) {
        canonicalOf.set(other.id, canonical.id);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const [dupId, canonId] of canonicalOf) {
    const list = groups.get(canonId) ?? [];
    list.push(dupId);
    groups.set(canonId, list);
  }

  if (groups.size === 0) {
    console.log('[NameDedupe] No name-containment venue fragmentation found.');
    return;
  }

  const nameById = new Map(all.map((v) => [v.id, v.name]));
  console.log(`[NameDedupe] ${APPLY ? 'APPLYING' : 'DRY RUN —'} ${groups.size} merge group(s):\n`);

  for (const [canonId, dupIds] of groups) {
    // Show event counts so a reviewer can gauge blast radius.
    const [{ value: canonEvents }] = await db
      .select({ value: count() }).from(events).where(eq(events.venueId, canonId));
    console.log(`  "${nameById.get(canonId)}" (${canonEvents} events) ← ${dupIds.map((id) => `"${nameById.get(id)}"`).join(', ')}`);
    if (APPLY) {
      const result = await mergeVenuesInto(canonId, dupIds);
      console.log(`      merged ${result.mergedVenues} venue(s), repointed ${result.repointedEvents} event(s)`);
    }
  }

  if (!APPLY) console.log('\n[NameDedupe] Review the pairs above, then re-run with --apply.');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[NameDedupe] Fatal error:', error);
    process.exit(1);
  });
