import { NextRequest, NextResponse } from 'next/server';
import { runNYCParksIngestion } from '@/lib/ingestion/nycParks';
import { isDemoModeEnabled } from '@/lib/utils/demoMode';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  // Verify CRON_SECRET to prevent unauthorized triggering
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoModeEnabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'DEMO_MODE active' });
  }

  try {
    const result = await runNYCParksIngestion();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
