/**
 * Eventbrite ingestion runner.
 *
 * Wraps the city-wide Eventbrite client with ingestion source tracking.
 * No longer iterates over per-organizer/venue config rows — the client
 * handles a single NYC-wide location search internally.
 */

import { updateIngestionSourceStatus } from '@/lib/db/ingestionService';
import { ingestEventbriteEvents } from '../eventbrite/client';

export interface IngestionResult {
  eventsUpserted: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

export async function runEventbriteIngestion(): Promise<IngestionResult> {
  const startTime = Date.now();
  const apiKey = process.env.EVENTBRITE_API_KEY;

  try {
    const result = await ingestEventbriteEvents(apiKey);

    await updateIngestionSourceStatus('eventbrite_api', 'active');

    return {
      eventsUpserted: (result.inserted ?? 0) + (result.updated ?? 0),
      eventsSkipped: result.skipped ?? 0,
      errors: result.errors ?? 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[Eventbrite] Pipeline failed:', err);
    await updateIngestionSourceStatus('eventbrite_api', 'error', String(err));
    throw err;
  }
}
