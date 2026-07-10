import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { venues } from '@/db/schema';
import { mergeVenuesInto } from '@/lib/db/venueService';
import { tokenizeVenueName } from '@/lib/utils/normalizeVenueName';
import { calculateDistanceMeters } from '@/lib/utils/calculateDistance';

/**
 * One-time cleanup of pre-registry seed fragmentation. Conservatively merges
 * venues that are clearly the same place under the building-level model:
 *   - identical normalized names (e.g. "The Town Hall" / "Town Hall"), or
 *   - one name's tokens fully contained in another's AND within 150m
 *     (e.g. "Zone One, Elsewhere" → "Elsewhere").
 *
 * The most general name (fewest tokens) becomes canonical. Dry-run by default;
 * pass --apply to perform the merges.
 */

const PROXIMITY_METERS = 150;
const APPLY = process.argv.includes('--apply');

interface V {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  tokens: Set<string>;
}

function isSubset(small: Set<string>, large: Set<string>): boolean {
  if (small.size === 0 || small.size > large.size) return false;
  for (const token of small) if (!large.has(token)) return false;
  return true;
}

function withinProximity(a: V, b: V): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  return calculateDistanceMeters(a.lat, a.lng, b.lat, b.lng) <= PROXIMITY_METERS;
}

async function run(): Promise<void> {
  const rows = await db
    .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
    .from(venues);

  const all: V[] = rows.map((row) => ({ ...row, tokens: tokenizeVenueName(row.name) }));

  // Most general (fewest tokens) first, so buildings are preferred as canonical.
  all.sort((a, b) => a.tokens.size - b.tokens.size);

  const canonicalOf = new Map<string, string>(); // duplicateId → canonicalId

  for (let i = 0; i < all.length; i++) {
    const canonical = all[i];
    if (canonicalOf.has(canonical.id)) continue; // already a duplicate of something else

    for (let j = 0; j < all.length; j++) {
      if (i === j) continue;
      const other = all[j];
      if (canonicalOf.has(other.id)) continue;
      if (other.tokens.size < canonical.tokens.size) continue; // never fold a more-general name

      const normalizedA = [...canonical.tokens].sort().join(' ');
      const normalizedB = [...other.tokens].sort().join(' ');
      const identical = normalizedA === normalizedB && normalizedA.length > 0;
      const contained = isSubset(canonical.tokens, other.tokens) && withinProximity(canonical, other);

      if (identical || contained) {
        canonicalOf.set(other.id, canonical.id);
      }
    }
  }

  // Group duplicates by canonical id.
  const groups = new Map<string, string[]>();
  for (const [dupId, canonId] of canonicalOf) {
    const list = groups.get(canonId) ?? [];
    list.push(dupId);
    groups.set(canonId, list);
  }

  if (groups.size === 0) {
    console.log('[Dedupe] No mergeable venue fragmentation found.');
    return;
  }

  const nameById = new Map(all.map((v) => [v.id, v.name]));
  console.log(`[Dedupe] ${APPLY ? 'APPLYING' : 'DRY RUN —'} ${groups.size} merge group(s):\n`);

  for (const [canonId, dupIds] of groups) {
    console.log(`  "${nameById.get(canonId)}" ← ${dupIds.map((id) => `"${nameById.get(id)}"`).join(', ')}`);
    if (APPLY) {
      const result = await mergeVenuesInto(canonId, dupIds);
      console.log(`    merged ${result.mergedVenues} venue(s), repointed ${result.repointedEvents} event(s)`);
    }
  }

  if (!APPLY) console.log('\n[Dedupe] Re-run with --apply to perform these merges.');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[Dedupe] Fatal error:', error);
    process.exit(1);
  });
