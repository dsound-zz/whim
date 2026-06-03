/**
 * Types for the Data Quality Audit system.
 *
 * These types define the structured audit results produced by auditEventQuality.ts
 * and consumed by the admin dashboard and batch audit script.
 */

// ─── Individual Check Results ────────────────────────────────────────────────

export interface AuditCheckResult {
  passed: boolean;
  detail: string;
}

export interface MissingFieldsCheckResult {
  passed: boolean;
  missingFields: string[];
}

export interface CoordinateCheckResult {
  passed: boolean;
  deltaMeters: number | null;
  suggestedLat: number | null;
  suggestedLng: number | null;
}

export interface PriceSanityCheckResult {
  passed: boolean;
  issues: string[];
}

export interface DuplicateCheckResult {
  passed: boolean;
  suspectedDuplicateIds: string[];
  matchDetails: Array<{
    eventId: string;
    title: string;
    venueName: string | null;
    sourceType: string;
    similarityScore: number;
  }>;
}

// ─── Composite Audit Result ──────────────────────────────────────────────────

export interface EventAuditResult {
  eventId: string;
  eventTitle: string;
  sourceType: string;
  overallScore: number; // 0–100 composite quality score
  checks: {
    staleEvent: AuditCheckResult;
    missingFields: MissingFieldsCheckResult;
    coordinateAccuracy: CoordinateCheckResult;
    priceSanity: PriceSanityCheckResult;
    duplicateSuspect: DuplicateCheckResult;
  };
  auditedAt: Date;
}

// ─── Dashboard Summary Types ─────────────────────────────────────────────────

export interface DataQualityOverview {
  totalActiveEvents: number;
  staleEventCount: number;
  missingImageCount: number;
  missingDescriptionCount: number;
  missingCoordsCount: number;
  duplicateSuspectCount: number;
  averageQualityScore: number | null;
  sourceBreakdown: Array<{
    sourceType: string;
    totalCount: number;
    missingImageCount: number;
    missingDescriptionCount: number;
    missingCoordsCount: number;
  }>;
}

export interface StaleEventRow {
  id: string;
  title: string;
  venueName: string | null;
  sourceType: string;
  startAt: Date;
  endAt: Date | null;
  status: string;
}

export interface IncompleteEventRow {
  id: string;
  title: string;
  venueName: string | null;
  sourceType: string;
  imageUrl: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
}

export interface DuplicateCluster {
  clusterId: string;
  events: Array<{
    id: string;
    title: string;
    venueName: string | null;
    sourceType: string;
    startAt: Date;
    lat: number | null;
    lng: number | null;
    ticketUrl: string | null;
    imageUrl: string | null;
  }>;
  similarityScore: number;
}
