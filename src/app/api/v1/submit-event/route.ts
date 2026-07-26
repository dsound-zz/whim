import { NextRequest, NextResponse } from 'next/server';
import { VenueSubmissionSchema } from '@/types/submission';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { insertDraftEvent } from '@/lib/db/eventService';
import { resolveVenueSafely } from '@/lib/db/venueService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const parseResult = VenueSubmissionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parseResult.data;

    // Geocode address using Mapbox utility
    const geocodeResult = await geocodeWithMapbox(
      payload.venueName,
      `${payload.venueName}, ${payload.address}`
    );

    const lat = geocodeResult?.lat ?? null;
    const lng = geocodeResult?.lng ?? null;

    // Resolve against the venue registry so submissions share canonical
    // venue identity (and coords) with API/scraper-sourced events.
    const resolvedVenue = await resolveVenueSafely({
      name: payload.venueName,
      address: payload.address,
      lat,
      lng,
      sourceType: 'direct_submission',
    });

    // Insert draft event
    const newEvent = await insertDraftEvent({
      ...payload,
      startAt: new Date(payload.startAt),
      venueId: resolvedVenue?.venueId ?? null,
      lat: resolvedVenue?.lat ?? lat,
      lng: resolvedVenue?.lng ?? lng,
    });

    return NextResponse.json({
      success: true,
      eventId: newEvent.id,
      geocoded: !!geocodeResult,
    });
  } catch (error) {
    console.error('Event submission API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
