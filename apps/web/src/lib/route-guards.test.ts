import { describe, expect, it } from 'vitest';

import { redirectIfAuthed } from './redirect-if-authed-guard';
import { requireAuth } from './require-auth';
import type { ServerSession } from './session-server';

const anonymousSession: ServerSession = { user: null };
const authedSession: ServerSession = {
  user: { email: 'ada@example.test', id: 'user-1', name: 'Ada Lovelace' },
};

describe('route guards', () => {
  it('redirects anonymous users to login preserving the attempted URL', () => {
    let thrown: unknown;

    try {
      requireAuth({ context: { session: anonymousSession }, location: { href: '/dashboard' } });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { options?: unknown }).options).toStrictEqual({
      search: { redirect: '/dashboard' },
      statusCode: 307,
      to: '/login',
    });
  });

  it('allows authenticated users through protected routes', () => {
    expect(() =>
      requireAuth({ context: { session: authedSession }, location: { href: '/dashboard' } }),
    ).not.toThrow();
  });

  it('redirects authenticated visitors away from public auth pages safely', () => {
    let thrown: unknown;

    try {
      redirectIfAuthed({
        context: { session: authedSession },
        search: { redirect: '/settings/team' },
      });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { options?: unknown }).options).toStrictEqual({
      statusCode: 307,
      to: '/settings/team',
    });
  });

  it('falls back to dashboard for unsafe authenticated redirects', () => {
    let thrown: unknown;

    try {
      redirectIfAuthed({
        context: { session: authedSession },
        search: { redirect: 'https://evil.example/phishing' },
      });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { options?: unknown }).options).toStrictEqual({
      statusCode: 307,
      to: '/dashboard',
    });
  });

  it('allows anonymous visitors to use public auth pages', () => {
    expect(() =>
      redirectIfAuthed({ context: { session: anonymousSession }, search: { redirect: '/login' } }),
    ).not.toThrow();
  });
});
