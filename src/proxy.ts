import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { findApiKeyByValue, incrementCallsToday } from './lib/db/apiKeyService';

// ── Admin Basic Auth ───────────────────────────────────────────────────────────
const ADMIN_USERNAME = 'demiansims';
const ADMIN_PASSWORD = 'BaFlw8083!';

function isAdminAuthenticated(request: NextRequest): boolean {
  const authorizationHeader = request.headers.get('authorization');
  if (!authorizationHeader) return false;

  const [scheme, encoded] = authorizationHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;

  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  // Split on first colon only — password may contain colons
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return false;

  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// In-memory rate limiting map for public submissions
// Stores IP -> { count: number, resetTime: number }
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect all /admin UI routes with HTTP Basic Auth
  if (pathname.startsWith('/admin')) {
    if (!isAdminAuthenticated(request)) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Whim Admin", charset="UTF-8"',
        },
      });
    }
    return NextResponse.next();
  }

  // Handle submit-event public rate limit bypass
  if (pathname === '/api/v1/submit-event') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               request.headers.get('x-real-ip') ||
               '127.0.0.1';

    // Strict rate limit: 5 requests per 10 minutes per IP
    const now = Date.now();
    const limitDuration = 10 * 60 * 1000;
    const limitCount = 5;

    const limitRecord = ipRateLimits.get(ip);
    if (!limitRecord || now > limitRecord.resetTime) {
      ipRateLimits.set(ip, { count: 1, resetTime: now + limitDuration });
    } else {
      if (limitRecord.count >= limitCount) {
        return NextResponse.json(
          { error: 'Too Many Requests: Rate limit exceeded for event submission' },
          { status: 429 }
        );
      }
      limitRecord.count += 1;
    }

    return NextResponse.next();
  }

  // Protect admin API routes with B2B API key (pro/admin tier required)
  if (pathname.startsWith('/api/v1/admin/')) {
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

      if (apiKeyRecord.tier !== 'admin' && apiKeyRecord.tier !== 'pro') {
        return NextResponse.json(
          { error: 'Forbidden: Admin tier access required' },
          { status: 403 }
        );
      }

      // Allow admin API request (do not count towards B2B rate limits)
      return NextResponse.next();
    } catch (error) {
      console.error('Middleware Admin Auth Error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  }

  // Standard B2B API key auth + rate limiting
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

    await incrementCallsToday(apiKeyRecord.id);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-customer-tier', apiKeyRecord.tier || 'free');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (error) {
    console.error('Middleware API Auth Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/v1/:path*'],
};
