import { redirect } from '@tanstack/react-router';

import type { ServerSession } from './session-server';

interface BeforeLoadCtx {
  context: { session: ServerSession };
  search: Record<string, unknown>;
}

/**
 * `beforeLoad` guard for public auth pages (login, register, landing,
 * forgot/reset password). Reads the session from the router context (set by
 * the root `beforeLoad`) — no extra `/auth/refresh` round-trip — and, if
 * the visitor is already authenticated, throws a redirect to the original
 * destination preserved in `?redirect=` or to `/dashboard` as a default.
 */
export function redirectIfAuthed({ context, search }: BeforeLoadCtx) {
  if (!context.session.user) {
    return;
  }
  const target = typeof search.redirect === 'string' ? search.redirect : '/dashboard';
  throw redirect({ to: target });
}
