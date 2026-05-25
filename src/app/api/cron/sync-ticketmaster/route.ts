import { NextRequest, NextResponse } from 'next/server';
import { ingestTicketmasterEvents } from '@/lib/ticketmaster/client';
import { db } from '@/db';
import { ingestionSources } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  // Verify CRON_SECRET to prevent unauthorized triggering
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await ingestTicketmasterEvents(process.env.TICKETMASTER_API_KEY, 'New York');
    
    // Update ingestion tracking
    await db
      .update(ingestionSources)
      .set({
        lastSyncedAt: new Date(),
        syncStatus: 'active',
        errorMessage: null,
      })
      .where(eq(ingestionSources.type, 'ticketmaster_api'));

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    
    // Mark ingestion as errored
    await db
      .update(ingestionSources)
      .set({
        syncStatus: 'error',
        errorMessage: String(error),
      })
      .where(eq(ingestionSources.type, 'ticketmaster_api'));

    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
