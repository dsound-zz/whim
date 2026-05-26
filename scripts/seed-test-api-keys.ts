import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { apiKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function run() {
  console.log('Seeding test API keys...');

  // Ensure clean state for test keys
  await db.delete(apiKeys).where(eq(apiKeys.key, 'test-key-free'));
  await db.delete(apiKeys).where(eq(apiKeys.key, 'test-key-limited'));
  await db.delete(apiKeys).where(eq(apiKeys.key, 'test-key-inactive'));

  // Insert test keys
  await db.insert(apiKeys).values([
    {
      key: 'test-key-free',
      customerName: 'Test Free Customer',
      customerEmail: 'free@test.com',
      tier: 'free',
      callsToday: 0,
      callLimit: 10,
      isActive: true,
    },
    {
      key: 'test-key-limited',
      customerName: 'Test Limited Customer',
      customerEmail: 'limited@test.com',
      tier: 'starter',
      callsToday: 10,
      callLimit: 10,
      isActive: true,
    },
    {
      key: 'test-key-inactive',
      customerName: 'Test Inactive Customer',
      customerEmail: 'inactive@test.com',
      tier: 'pro',
      callsToday: 0,
      callLimit: 100,
      isActive: false,
    },
  ]);

  console.log('Successfully seeded 3 test API keys:');
  console.log('- test-key-free (active, calls: 0/10, tier: free)');
  console.log('- test-key-limited (active, calls: 10/10, tier: starter)');
  console.log('- test-key-inactive (inactive, calls: 0/100, tier: pro)');

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
