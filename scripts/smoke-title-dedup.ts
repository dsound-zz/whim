import { tokenize, jaccardSimilarity } from '@/lib/utils/venueMatching';

/**
 * Focused check that the upgraded title matching handles the two cases that
 * broke the old Jaccard-only threshold: accented variants and tour-name suffixes.
 * Mirrors areTitlesSimilar (containment OR Jaccard >= 0.55) so we can assert.
 */
function titlesMatch(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return false;
  if (jaccardSimilarity(ta, tb) >= 0.55) return true;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

const cases: Array<[string, string, boolean]> = [
  // [titleA, titleB, expectedMatch]
  ['ROSALIA', 'Rosalía: LUX TOUR 2026', true],                  // diacritic + tour suffix
  ['5 Seconds Of Summer', "5 Seconds Of Summer: Everyone's A Star! World Tour", true],
  ['Khalid, Lauv, And Lion Babe', "Khalid: It's Always Summer Somewhere Tour", false], // share only "khalid" — but different lineups; containment of neither
  ['Josh Groban', 'Josh Groban With Special Guest Jennifer Hudson', true],
  ['Hamilton', 'Entertainment Networking Event', false],        // must NOT match
  ['Cats: The Jellicle Ball', 'HONNE', false],                  // must NOT match
];

let passed = 0;
for (const [a, b, expected] of cases) {
  const got = titlesMatch(a, b);
  const ok = got === expected;
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  match=${got} (expected ${expected})  "${a}"  vs  "${b}"`);
}
console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
