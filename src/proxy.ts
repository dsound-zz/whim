import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { findApiKeyByValue, incrementCallsToday } from './lib/db/apiKeyService';

export async function proxy(request: NextRequest) {
  const apiKeyHeader = request.headers.get('x-api-key');

  if (!apiKeyHeader) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing API key in x-api-key header' },
      { status: 401 }
    );
  }

  try {
    const apiKeyRecord = await findApiKeyByValue(apiKeyHeader);

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or inactive API key' },
        { status: 401 }
      );
    }

    const callsToday = apiKeyRecord.callsToday ?? 0;
    const callLimit = apiKeyRecord.callLimit ?? 100;

    if (callsToday >= callLimit) {
      return NextResponse.json(
        { error: 'Too Many Requests: API key rate limit exceeded' },
        { status: 429 }
      );
    }

    // Increment calls counter in DB
    await incrementCallsToday(apiKeyRecord.id);

    // Forward request with tier header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-customer-tier', apiKeyRecord.tier || 'free');

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error: any) {
    console.error('Middleware API Auth Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export const config = {
  matcher: '/api/v1/:path*',
};
