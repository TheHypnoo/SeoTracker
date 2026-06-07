import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth-context';

/**
 * Whether the current user is a platform administrator (operator of SEOTracker
 * itself), per the backend `PLATFORM_ADMIN_EMAILS` allowlist surfaced by
 * `GET /auth/me`. Used to gate internal-only UI such as the engine-health
 * dashboard. The backend enforces this independently; this is UI gating only.
 */
export function usePlatformAdmin(): boolean {
  const auth = useAuth();
  const me = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => auth.api.get<{ isPlatformAdmin: boolean }>('/auth/me'),
    enabled: Boolean(auth.user),
    staleTime: 5 * 60_000,
  });
  return me.data?.isPlatformAdmin ?? false;
}
