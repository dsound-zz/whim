/**
 * Ingestion source status tracking service.
 *
 * Handles the "check exists → update or insert" pattern for the
 * ingestion_sources table. Previously duplicated across nycParks.ts,
 * songkick.ts, and other ingestion modules.
 */

import { db } from '@/db';
import { ingestionSources } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export type IngestionSyncStatus = 'active' | 'paused' | 'error';

/**
 * Updates (or creates) an ingestion source record with the given status.
 * Upserts by `type` — each source type has at most one tracking row.
 */
export async function updateIngestionSourceStatus(
  sourceType: string,
  syncStatus: IngestionSyncStatus,
  errorMessage?: string | null
): Promise<void> {
  try {
    const existing = await db
      .select({ id: ingestionSources.id })
      .from(ingestionSources)
      .where(eq(ingestionSources.type, sourceType as any))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(ingestionSources)
        .set({
          lastSyncedAt: new Date(),
          syncStatus,
          errorMessage: errorMessage ?? null,
        })
        .where(eq(ingestionSources.id, existing[0].id));
    } else {
      await db.insert(ingestionSources).values({
        type: sourceType as any,
        lastSyncedAt: new Date(),
        syncStatus,
        errorMessage: errorMessage ?? null,
      });
    }
  } catch (error) {
    console.error(`[IngestionService] Failed to update status for ${sourceType}:`, error);
  }
}

/**
 * Fetches all active ingestion sources for Eventbrite.
 * This is used to iterate and fetch targeted events.
 */
export async function getActiveEventbriteSources() {
  return await db
    .select()
    .from(ingestionSources)
    .where(
      and(
        eq(ingestionSources.type, 'eventbrite_api'),
        eq(ingestionSources.syncStatus, 'active')
      )
    );
}

/**
 * Updates an ingestion source record by its specific ID.
 */
export async function updateIngestionSourceStatusById(
  id: string,
  syncStatus: IngestionSyncStatus,
  errorMessage?: string | null
): Promise<void> {
  try {
    await db
      .update(ingestionSources)
      .set({
        lastSyncedAt: new Date(),
        syncStatus,
        errorMessage: errorMessage ?? null,
      })
      .where(eq(ingestionSources.id, id));
  } catch (error) {
    console.error(`[IngestionService] Failed to update status for source ID ${id}:`, error);
  }
}
