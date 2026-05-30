import { db } from '@/db';
import { apiKeys } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Looks up an API key record and auto-resets callsToday if the last reset
 * was on a previous calendar day (UTC). This eliminates the need for a
 * separate daily cron to zero out counters.
 */
export async function findApiKeyByValue(key: string) {
  const result = await db.select().from(apiKeys).where(eq(apiKeys.key, key)).limit(1);
  const record = result[0] || null;

  if (record && shouldResetCounter(record.lastResetAt)) {
    await db
      .update(apiKeys)
      .set({
        callsToday: 0,
        lastResetAt: new Date(),
      })
      .where(eq(apiKeys.id, record.id));

    record.callsToday = 0;
    record.lastResetAt = new Date();
  }

  return record;
}

export async function incrementCallsToday(keyId: string) {
  await db
    .update(apiKeys)
    .set({
      callsToday: sql`${apiKeys.callsToday} + 1`,
    })
    .where(eq(apiKeys.id, keyId));
}

/**
 * Resets all API key call counters. Can be called manually or from a cron job
 * as a fallback safety net for the inline auto-reset.
 */
export async function resetAllCallsToday(): Promise<number> {
  const result = await db
    .update(apiKeys)
    .set({
      callsToday: 0,
      lastResetAt: new Date(),
    })
    .returning({ id: apiKeys.id });

  return result.length;
}

/**
 * Returns true if the last reset was before today (UTC), meaning the
 * counter should be zeroed for the new day.
 */
function shouldResetCounter(lastResetAt: Date | null): boolean {
  if (!lastResetAt) return true;

  const now = new Date();
  const lastResetDate = lastResetAt.toISOString().split('T')[0];
  const todayDate = now.toISOString().split('T')[0];

  return lastResetDate !== todayDate;
}

