import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '../lib/auth-context';

/**
 * Renders children only when the visitor is NOT authenticated. If they are,
 * redirect to the original destination preserved in `?redirect=` (when set
 * by requireAuth) or to `/dashboard` as a default. Use it to wrap the
 * landing page and any auth-only screens (login, register, forgot-password,
 * reset-password) so logged-in users don't see them.
 */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search }) as {
    redirect?: string;
  };

  useEffect(() => {
    if (auth.user) {
      const target = typeof search.redirect === 'string' ? search.redirect : '/dashboard';
      void navigate({ replace: true, to: target });
    }
  }, [auth.user, navigate, search.redirect]);

  if (auth.user) {
    return null;
  }

  return <>{children}</>;
}
