import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
} from './actions';
import VerificationDashboard from './VerificationDashboard';

export const metadata = {
  title: 'Integrity Verification — Whim Admin',
  description: 'Event integrity smoke test results and manual verification runner.',
};

export default async function VerificationPage() {
  const [initialLogs, initialStats] = await Promise.all([
    fetchVerificationLogsAction(),
    fetchVerificationStatsAction(),
  ]);

  return (
    <VerificationDashboard
      initialLogs={initialLogs}
      initialStats={initialStats}
    />
  );
}
