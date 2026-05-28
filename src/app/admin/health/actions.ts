"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface HealthStats {
  sourceType: string;
  totalVenues: number;
  activeCount: number;
  errorCount: number;
  lastSyncedAt: string | null;
  sampleErrorMessage: string | null;
}

export async function fetchIngestionHealth(): Promise<HealthStats[]> {
  try {
    const rawData = await db.execute(sql`
      SELECT 
        type as "sourceType",
        COUNT(*) as "totalVenues",
        SUM(CASE WHEN sync_status = 'active' THEN 1 ELSE 0 END) as "activeCount",
        SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as "errorCount",
        MAX(last_synced_at) as "lastSyncedAt",
        MAX(CASE WHEN sync_status = 'error' THEN error_message ELSE NULL END) as "sampleErrorMessage"
      FROM ingestion_sources
      GROUP BY type
      ORDER BY type ASC
    `);

    return rawData.rows.map((row: any) => ({
      sourceType: row.sourceType,
      totalVenues: parseInt(row.totalVenues, 10) || 0,
      activeCount: parseInt(row.activeCount, 10) || 0,
      errorCount: parseInt(row.errorCount, 10) || 0,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null,
      sampleErrorMessage: row.sampleErrorMessage || null,
    }));
  } catch (err) {
    console.error("Failed to fetch ingestion health:", err);
    return [];
  }
}

export async function fetchRecentErrors(): Promise<{ venueName: string, type: string, error: string, lastSyncedAt: string }[]> {
  try {
    const rawData = await db.execute(sql`
      SELECT 
        v.name as "venueName",
        i.type,
        i.error_message as "error",
        i.last_synced_at as "lastSyncedAt"
      FROM ingestion_sources i
      LEFT JOIN venues v ON i.venue_id = v.id
      WHERE i.sync_status = 'error'
      ORDER BY i.last_synced_at DESC NULLS LAST
      LIMIT 20
    `);

    return rawData.rows.map((row: any) => ({
      venueName: row.venueName || 'Unknown Venue',
      type: row.type,
      error: row.error,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : 'Never',
    }));
  } catch (err) {
    console.error("Failed to fetch recent errors:", err);
    return [];
  }
}
