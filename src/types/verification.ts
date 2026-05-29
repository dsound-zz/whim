// ─── Input ───────────────────────────────────────────────────────────────────
// Slim projection of an events row containing the fields each check phase needs.
// We don't pass the full Drizzle row to keep the service decoupled from the ORM.

export interface EventData {
  id: string;
  title: string;
  startAt: Date;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  ticketUrl: string | null;
  sourceType: string;
}

// ─── Verification status ──────────────────────────────────────────────────────
// Mirrors the verificationStatusEnum values in schema.ts.

export type VerificationStatus =
  | 'verified'
  | 'flagged_content'
  | 'flagged_coordinates'
  | 'flagged_both'
  | 'skipped'
  | 'error';

// ─── LLM response ─────────────────────────────────────────────────────────────
// The exact JSON shape we instruct Gemini to return in JSON mode.

export interface LlmEvaluationResponse {
  confirmed: boolean;
  reason: string;
}

// ─── Coordinate lookup result ─────────────────────────────────────────────────

export interface MapboxGeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
}

// ─── Output ───────────────────────────────────────────────────────────────────
// Full output of verifyEventIntegrity(). Mirrors the event_verification_logs columns.

export interface VerificationResult {
  eventId: string;
  status: VerificationStatus;

  // Content check
  pageTextSnippet: string | null;
  llmConfirmed: boolean | null;
  llmReason: string | null;

  // Coordinate check
  storedLat: number | null;
  storedLng: number | null;
  mapboxLat: number | null;
  mapboxLng: number | null;
  coordDeltaMeters: number | null;

  // Summary
  mismatchReason: string | null;
  errorMessage: string | null;
}

// ─── Admin UI display types ───────────────────────────────────────────────────

export interface VerificationLog {
  id: string;
  eventId: string;
  eventTitle: string;
  eventVenueName: string | null;
  checkedAt: Date;
  status: VerificationStatus;
  llmConfirmed: boolean | null;
  llmReason: string | null;
  coordDeltaMeters: number | null;
  mismatchReason: string | null;
  errorMessage: string | null;
  ticketUrl: string | null;
}

export interface VerificationStats {
  totalChecked: number;
  verified: number;
  flaggedContent: number;
  flaggedCoordinates: number;
  flaggedBoth: number;
  skipped: number;
  errors: number;
  lastCheckedAt: Date | null;
}
