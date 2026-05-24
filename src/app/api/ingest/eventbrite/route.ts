import { NextResponse } from 'next/server';
import { ingestEventbriteEvents } from '@/lib/eventbrite/client';

export async function POST(request: Request) {
  try {
    // Basic auth check for cron or manual triggers
    const authHeader = request.headers.get('authorization');
    if (process.env.INGEST_SECRET && authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.EVENTBRITE_API_KEY; // Optional for MVP due to mock fallback
    
    const results = await ingestEventbriteEvents(apiKey, 'New York');

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
