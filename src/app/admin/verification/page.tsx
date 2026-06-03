import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
  fetchOverviewAction,
} from './actions';
import DataQualityDashboard from './DataQualityDashboard';

export const metadata = {
  title: 'Data Quality Audit — Whim Admin',
  description: 'Comprehensive data quality audit dashboard with integrity verification, stale event detection, and completeness tracking.',
};

export default async function VerificationPage() {
  const [initialLogs, initialStats, initialOverview] = await Promise.all([
    fetchVerificationLogsAction(),
    fetchVerificationStatsAction(),
    fetchOverviewAction(),
  ]);

  return (
    <DataQualityDashboard
      initialLogs={initialLogs}
      initialStats={initialStats}
      initialOverview={initialOverview}
    />
  );
}
