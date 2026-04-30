import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';

// Server-only env: absolute URL to the API. The browser-facing VITE_API_URL
// is a relative path that flows through the Nitro proxy.
const API_BASE_URL =
  process.env.SERVER_API_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const REFRESH_COOKIE_NAME = import.meta.env.VITE_REFRESH_COOKIE_NAME ?? 'refresh_token';

export interface ServerSession {
  user: { id: string; email: string; name?: string } | null;
}

const EMPTY: ServerSession = { user: null };

/**
 * Resolve the visitor's session on the server WITHOUT rotating the refresh
 * token. Calls the backend's `GET /auth/session` endpoint, which only
 * verifies the refresh JWT and looks up the user — no token rotation, no
 * Set-Cookie noise, no auth-throttle consumption.
 *
 * The access token is NOT returned here. The client receives one from the
 * `/auth/login` response and renews it transparently via the ApiClient's
 * 401 → /auth/refresh fallback when it expires (~ once every 15 minutes).
 *
 * Runs:
 *   - SSR (root route's `beforeLoad`): determines the chrome to render.
 *   - SPA navigation (RPC): re-validates the session before each route change.
 */
export const getServerSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ServerSession> => {
    const refreshToken = getCookie(REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      return EMPTY;
    }

    // Forward the entire incoming Cookie header so the API receives the
    // refresh_token (HttpOnly) it needs to validate the session.
    const cookieHeader = getRequestHeader('cookie') ?? '';

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/session`, {
        headers: { cookie: cookieHeader },
        method: 'GET',
      });
    } catch {
      return EMPTY;
    }

    if (!response.ok) {
      return EMPTY;
    }

    let user: NonNullable<ServerSession['user']>;
    try {
      user = (await response.json()) as NonNullable<ServerSession['user']>;
    } catch {
      return EMPTY;
    }
    if (!user?.id) {
      return EMPTY;
    }

    return { user };
  },
);
