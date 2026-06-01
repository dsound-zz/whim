import { NextRequest, NextResponse } from 'next/server';
import { publishDraftEvent } from '@/lib/db/eventService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing event ID' },
        { status: 400 }
      );
    }

    await publishDraftEvent(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Publish event error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
