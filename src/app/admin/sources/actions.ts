"use server";

import { db } from "@/db";
import { ingestionSources, venues } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function fetchIngestionSourcesAction() {
  try {
    const data = await db
      .select({
        id: ingestionSources.id,
        type: ingestionSources.type,
        config: ingestionSources.config,
        syncStatus: ingestionSources.syncStatus,
        errorMessage: ingestionSources.errorMessage,
        lastSyncedAt: ingestionSources.lastSyncedAt,
        venueName: venues.name,
      })
      .from(ingestionSources)
      .leftJoin(venues, eq(ingestionSources.venueId, venues.id))
      .orderBy(desc(ingestionSources.createdAt));
      
    return data;
  } catch (error) {
    console.error("Failed to fetch ingestion sources:", error);
    return [];
  }
}

import { extractEventbriteId } from "@/lib/utils/resolveEventbriteUrl";

export async function addEventbriteSourceAction(configData: { organizer_id?: string, venue_id?: string, url?: string }) {
  try {
    let finalConfig = { ...configData };

    if (configData.url) {
      const apiKey = process.env.EVENTBRITE_API_KEY;
      if (!apiKey) {
        return { success: false, error: "System is missing EVENTBRITE_API_KEY to resolve event URLs." };
      }
      const extractedId = await extractEventbriteId(configData.url, apiKey);
      if (!extractedId) {
        return { success: false, error: "Invalid Eventbrite URL format. Could not extract Organizer ID." };
      }
      finalConfig = { organizer_id: extractedId };
      delete finalConfig.url;
    }

    await db.insert(ingestionSources).values({
      type: "eventbrite_api",
      config: finalConfig,
      syncStatus: "active",
      lastSyncedAt: new Date(),
    });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to add Eventbrite source:", error);
    return { success: false, error: error.message };
  }
}
