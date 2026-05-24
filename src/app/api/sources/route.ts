import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const results = await db.select({
      sourceType: events.sourceType,
      count: sql<number>`cast(count(${events.id}) as int)`
    })
    .from(events)
    .groupBy(events.sourceType);

    // Format into a nice object for consumers
    const formattedData = results.reduce((acc, row) => {
      acc[row.sourceType] = row.count;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error: any) {
    console.error('API /sources error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
