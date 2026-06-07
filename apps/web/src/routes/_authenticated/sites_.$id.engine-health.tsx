import { createFileRoute } from '@tanstack/react-router';

import { EngineHealthDashboard } from '#/components/engine-health/engine-health-dashboard';

export const Route = createFileRoute('/_authenticated/sites_/$id/engine-health')({
  component: SiteEngineHealthPage,
});

function SiteEngineHealthPage() {
  const { id } = Route.useParams();
  return <EngineHealthDashboard siteId={id} />;
}
