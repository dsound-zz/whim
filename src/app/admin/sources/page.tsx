import { fetchIngestionSourcesAction } from './actions';
import SourcesDashboard from './SourcesDashboard';

export const metadata = {
  title: 'Ingestion Sources — Whim Admin',
  description: 'Manage and monitor ingestion sources.',
};

export default async function AdminSourcesPage() {
  const initialSources = await fetchIngestionSourcesAction();

  return (
    <SourcesDashboard initialSources={initialSources as any} />
  );
}
