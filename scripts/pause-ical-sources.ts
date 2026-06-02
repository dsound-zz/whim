/**
 * One-time cleanup: pause all unverified iCal sources seeded without confirmed URLs.
 * Run: npm run seed:ical-sources after updating ICAL_SOURCES with verified URLs.
 */
import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { ingestionSources } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');

  await db
    .update(ingestionSources)
    .set({
      syncStatus: 'paused',
      errorMessage: 'Feed URL awaiting verification — re-seed with confirmed URLs',
    })
    .where(eq(ingestionSources.type, 'ical'));

  console.log('[cleanup] All iCal sources set to paused.');
  console.log('[cleanup] Re-run "npm run seed:ical-sources" after updating feed URLs.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
