import { Outlet, createFileRoute } from '@tanstack/react-router';

import { requireAuth } from '../lib/require-auth';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: requireAuth,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
