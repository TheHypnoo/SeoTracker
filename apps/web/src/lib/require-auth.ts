import { redirect } from '@tanstack/react-router';

import type { ServerSession } from './session-server';

interface BeforeLoadCtx {
  context: { session: ServerSession };
  location: { href: string };
}

/**
 * Auth guard for protected routes. The session was resolved exactly once in
 * the root `beforeLoad` (which calls `getServerSession`) and exposed via the
 * router context. We just check the result here — no extra `/auth/refresh`
 * call, so concurrent loaders on the same navigation never race.
 */
export function requireAuth({ context, location }: BeforeLoadCtx) {
  if (!context.session.user) {
    throw redirect({
      search: { redirect: location.href },
      to: '/login',
    });
  }
}
