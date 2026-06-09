import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ingestionSources } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { ingestICalFeed } from '@/lib/ical/ingest';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sources = await db
      .select({ id: ingestionSources.id, config: ingestionSources.config })
      .from(ingestionSources)
      .where(
        and(
          eq(ingestionSources.type, 'ical'),
          ne(ingestionSources.syncStatus, 'paused')
        )
      );

    const results = [];

    for (const source of sources) {
      const config = source.config as { feedUrl?: string; defaultVenueName?: string };
      if (!config?.feedUrl) continue;

      const result = await ingestICalFeed({
        id: source.id,
        feedUrl: config.feedUrl,
        defaultVenueName: config.defaultVenueName ?? 'Unknown Venue',
      });

      results.push({ feedUrl: config.feedUrl, ...result });
    }

    const totals = results.reduce(
      (acc, r) => ({
        inserted: acc.inserted + (r.eventsInserted ?? 0),
        updated: acc.updated + (r.eventsUpdated ?? 0),
        errors: acc.errors + (r.errors ?? 0),
      }),
      { inserted: 0, updated: 0, errors: 0 }
    );

    return NextResponse.json({ success: true, feeds: results.length, ...totals });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
