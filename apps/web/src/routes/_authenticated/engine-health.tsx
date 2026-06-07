import { createFileRoute } from '@tanstack/react-router';

import { EngineHealthDashboard } from '#/components/engine-health/engine-health-dashboard';

export const Route = createFileRoute('/_authenticated/engine-health')({
  component: PlatformEngineHealthPage,
  validateSearch: (search) => ({
    projectId: typeof search.projectId === 'string' ? search.projectId : undefined,
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
});

function PlatformEngineHealthPage() {
  const { projectId, siteId } = Route.useSearch();
  return <EngineHealthDashboard projectId={projectId} siteId={siteId} />;
}
