import { db } from '@/db';
import { apiKeys } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function findApiKeyByValue(key: string) {
  const result = await db.select().from(apiKeys).where(eq(apiKeys.key, key)).limit(1);
  return result[0] || null;
}

export async function incrementCallsToday(keyId: string) {
  await db
    .update(apiKeys)
    .set({
      callsToday: sql`${apiKeys.callsToday} + 1`,
    })
    .where(eq(apiKeys.id, keyId));
}
