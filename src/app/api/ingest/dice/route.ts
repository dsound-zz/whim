import { NextResponse } from 'next/server';
import { scrapeDiceEvents } from '@/lib/dice/scraper';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.INGEST_SECRET && authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await scrapeDiceEvents();

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Dice Scrape error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
