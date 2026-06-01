"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { AdminEvent } from "./types";

export async function fetchAdminEvents(): Promise<AdminEvent[]> {
  try {
    const dedupedRaw = await db.execute(sql`
      SELECT * FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name
            ORDER BY start_at ASC
          ) as rn
        FROM events
        WHERE status = 'active' OR (status = 'draft' AND source_type = 'direct_submission')
      ) ranked
      WHERE rn = 1
      ORDER BY start_at ASC
      LIMIT 500
    `);

    const countsRaw = await db.execute(sql`
      SELECT title, venue_name, COUNT(*) as count
      FROM events
      WHERE status = 'active' OR (status = 'draft' AND source_type = 'direct_submission')
      GROUP BY title, venue_name
      HAVING COUNT(*) > 1
    `);

    const countMap = new Map<string, number>();
    for (const row of countsRaw.rows as unknown as { title: string; venue_name: string | null; count: string }[]) {
      countMap.set(`${row.title}|${row.venue_name}`, parseInt(row.count, 10));
    }

    const data: AdminEvent[] = (dedupedRaw.rows as unknown as {
      id: string;
      title: string;
      venue_name: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
      start_at: string;
      end_at: string | null;
      is_free: boolean | null;
      price_min: number | null;
      price_max: number | null;
      ticket_url: string | null;
      source_type: string;
      category: string | null;
      status: string | null;
      is_verified: boolean | null;
      confidence_score: number | null;
    }[]).map((row) => {
      const moreDates = (countMap.get(`${row.title}|${row.venue_name}`) || 1) - 1;
      return {
        id: row.id,
        title: row.title,
        venueName: row.venue_name,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        startAt: new Date(row.start_at),
        endAt: row.end_at ? new Date(row.end_at) : null,
        isFree: row.is_free,
        priceMin: row.price_min,
        priceMax: row.price_max,
        ticketUrl: row.ticket_url,
        sourceType: row.source_type,
        category: row.category,
        status: row.status,
        isVerified: row.is_verified,
        confidenceScore: row.confidence_score,
        moreDates: moreDates > 0 ? moreDates : undefined,
      };
    });

    return data;
  } catch (err) {
    console.error("Failed to fetch admin events:", err);
    return [];
  }
}
