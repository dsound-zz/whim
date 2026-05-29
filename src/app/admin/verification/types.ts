import type { VerificationLog, VerificationStats, VerificationStatus } from '@/types/verification';

// Re-export for use within the admin/verification route without crossing the
// types/ boundary in client components (which can't import server-only modules).
export type { VerificationLog, VerificationStats, VerificationStatus };

/** Maps each status to its display label and Tailwind color classes. */
export const VERIFICATION_STATUS_META: Record<
  VerificationStatus,
  { label: string; badgeBg: string; badgeText: string; dotColor: string }
> = {
  verified: {
    label: 'Verified',
    badgeBg: 'bg-emerald-900/40',
    badgeText: 'text-emerald-300',
    dotColor: 'bg-emerald-400',
  },
  flagged_content: {
    label: 'Content Flag',
    badgeBg: 'bg-amber-900/40',
    badgeText: 'text-amber-300',
    dotColor: 'bg-amber-400',
  },
  flagged_coordinates: {
    label: 'Coord Flag',
    badgeBg: 'bg-orange-900/40',
    badgeText: 'text-orange-300',
    dotColor: 'bg-orange-400',
  },
  flagged_both: {
    label: 'Both Flagged',
    badgeBg: 'bg-red-900/40',
    badgeText: 'text-red-300',
    dotColor: 'bg-red-400',
  },
  skipped: {
    label: 'Skipped',
    badgeBg: 'bg-zinc-800/60',
    badgeText: 'text-zinc-400',
    dotColor: 'bg-zinc-500',
  },
  error: {
    label: 'Error',
    badgeBg: 'bg-rose-900/40',
    badgeText: 'text-rose-300',
    dotColor: 'bg-rose-400',
  },
};
