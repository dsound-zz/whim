import { db } from '@/db';
import { ingestionSources } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ingestTicketmasterEvents } from '../ticketmaster/client';

export interface IngestionResult {
  eventsUpserted: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

export async function runTicketmasterIngestion(): Promise<IngestionResult> {
  const startTime = Date.now();
  
  try {
    const apiKey = process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      throw new Error('TICKETMASTER_CONSUMER_KEY / TICKETMASTER_API_KEY is required but not set.');
    }

    const result = await ingestTicketmasterEvents(apiKey, 'New York');

    // Update ingestion tracking
    await db
      .update(ingestionSources)
      .set({
        lastSyncedAt: new Date(),
        syncStatus: 'active',
        errorMessage: null,
      })
      .where(eq(ingestionSources.type, 'ticketmaster_api'));

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
      .where(eq(ingestionSources.type, 'ticketmaster_api'));

    throw error;
  }
}
