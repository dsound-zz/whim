import { NextResponse } from 'next/server';
import { ingestTicketmasterEvents } from '@/lib/ticketmaster/client';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.INGEST_SECRET && authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'TICKETMASTER_API_KEY is not configured.' }, { status: 500 });
    }
    
    const results = await ingestTicketmasterEvents(apiKey, 'New York');

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
