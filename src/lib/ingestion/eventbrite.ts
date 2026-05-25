import { db } from '@/db';
import { ingestionSources } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ingestEventbriteEvents } from '../eventbrite/client';

export interface IngestionResult {
  eventsUpserted: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

export async function runEventbriteIngestion(): Promise<IngestionResult> {
  const startTime = Date.now();

  try {
    const apiKey = process.env.EVENTBRITE_API_KEY;

    // ingestEventbriteEvents handles optional apiKey with mock fallback
    const result = await ingestEventbriteEvents(apiKey, 'New York');

    // Update ingestion tracking
    await db
      .update(ingestionSources)
      .set({
        lastSyncedAt: new Date(),
        syncStatus: 'active',
        errorMessage: null,
      })
      .where(eq(ingestionSources.type, 'eventbrite_api'));

    return {
      eventsUpserted: (result.inserted || 0) + (result.updated || 0),
      eventsSkipped: 0,
      errors: result.errors || 0,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    // Mark ingestion as errored
    await db
      .update(ingestionSources)
      .set({
        syncStatus: 'error',
        errorMessage: String(error),
      })
      .where(eq(ingestionSources.type, 'eventbrite_api'));

    throw error;
  }
}
