import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, or } from 'drizzle-orm';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';

const BATCH_SIZE = 50;

/**
 * One-time backfill script:
 * 1. Normalizes titles on all existing events.
 * 2. Re-classifies categories for events that are currently 'other' or uncategorized.
 *
 * Processes events in batches to avoid memory and rate-limit issues.
 * Safe to re-run: only updates fields that benefit from it.
 */
async function run() {
  console.log('[Backfill] Starting title normalization + category classification backfill...');

  let offset = 0;
  let totalProcessed = 0;
  let totalTitleUpdates = 0;
  let totalCategoryUpdates = 0;
  let errors = 0;

  while (true) {
    const batch = await db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        category: events.category,
        sourceType: events.sourceType,
      })
      .from(events)
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    console.log(`[Backfill] Processing batch of ${batch.length} (offset ${offset})...`);

    for (const event of batch) {
      try {
        const updatedFields: Record<string, unknown> = { updatedAt: new Date() };
        let hasChanges = false;

        // 1. Title normalization
        const normalizedTitle = normalizeEventTitle(event.title);
        if (normalizedTitle && normalizedTitle !== event.title) {
          updatedFields.title = normalizedTitle;
          hasChanges = true;
          totalTitleUpdates++;
        }

        // 2. Category re-classification: only update events that are 'other' or null
        const shouldReclassify = event.category === 'other' || event.category === null;
        if (shouldReclassify) {
          const titleForClassification = (updatedFields.title as string) ?? event.title;
          const newCategory = await classifyEventCategory({
            title: titleForClassification,
            description: event.description,
            // Use LLM fallback for all sources since this is a one-time run
            skipLlmFallback: false,
          });

          if (newCategory !== event.category) {
            updatedFields.category = newCategory;
            hasChanges = true;
            totalCategoryUpdates++;
          }
        }

        if (hasChanges) {
          await db
            .update(events)
            .set(updatedFields)
            .where(eq(events.id, event.id));
        }

        // Small delay to avoid hammering the Gemini API rate limit
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`[Backfill] Failed to process event ${event.id}:`, error);
        errors++;
      }

      totalProcessed++;
    }

    offset += BATCH_SIZE;

    // Delay between batches to be polite to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('[Backfill] Complete.');
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Title updates:   ${totalTitleUpdates}`);
  console.log(`  Category updates: ${totalCategoryUpdates}`);
  console.log(`  Errors:          ${errors}`);

  process.exit(errors > 0 ? 1 : 0);
}

run();
