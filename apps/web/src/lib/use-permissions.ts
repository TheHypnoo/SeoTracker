import { Permission, Role } from '@seotracker/shared-types';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth-context';

type ProjectAuthz = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  role: Role;
  effectivePermissions: Permission[];
};

/**
 * Hook that fetches the caller's role and effective permission set on a
 * project, plus a `can(perm)` helper to gate UI elements.
 *
 * Returns null `data` while loading or when no projectId is available — the
 * `can` helper conservatively returns `false` in that state, matching the
 * server's "deny by default" behavior. Render skeletons / loading UI based on
 * `isLoading`, not on `can()`, to avoid flashing locked buttons during fetch.
 */
export function usePermissions(projectId: string | null | undefined) {
  const auth = useAuth();
  const query = useQuery<ProjectAuthz>({
    queryKey: ['project-authz', projectId],
    queryFn: () => auth.api.get<ProjectAuthz>(`/projects/${projectId}`),
    enabled: Boolean(auth.accessToken && projectId),
    staleTime: 30_000,
  });

  const permissions = query.data?.effectivePermissions ?? [];
  const set = new Set(permissions);
  const can = (perm: Permission) => set.has(perm);
  const role = query.data?.role ?? null;

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    role,
    permissions,
    can,
    refetch: query.refetch,
  };
}
