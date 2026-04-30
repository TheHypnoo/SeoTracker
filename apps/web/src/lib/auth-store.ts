import { ApiClient, ApiClientError } from '#/lib/api-client';
import { create } from 'zustand';

import { deleteCookie, getCookie } from './cookies';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface LoginInput {
  email: string;
  password: string;
}
interface RegisterInput {
  name: string;
  email: string;
  password: string;
}
interface ForgotInput {
  email: string;
}
interface ResetInput {
  token: string;
  password: string;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
}

interface AuthActions {
  setSession: (input: { user?: User | null; accessToken?: string | null }) => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  forgotPassword: (input: ForgotInput) => Promise<void>;
  resetPassword: (input: ResetInput) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: (options?: { afterClear?: () => void | Promise<void> }) => Promise<void>;
}

// Browser uses the relative path that flows through the dev/prod proxy.
// On the server (SSR or server functions), use the absolute URL — Node fetch
// can't resolve relative paths against an origin.
const API_BASE_URL =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_API_URL ?? '/api/v1')
    : (process.env.SERVER_API_URL ?? 'http://localhost:4000/api/v1');
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME ?? 'csrf_token';

/**
 * Single shared API client.
 *
 * The store is the source of truth for the in-memory access token; the client
 * reads it lazily on every request via `getAccessToken`. `refreshSession`
 * wires the auto-refresh flow so an expired access token mid-session is
 * recovered transparently (rotate refresh cookie → new access token →
 * original request replayed). The initial session, however, is resolved
 * server-side by the SSR loader: the client never bootstraps auth on its own.
 */
export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshSession: () => useAuthStore.getState().refresh(),
});

/**
 * Zustand store backing all auth state on the client.
 *
 * Holds the access token in memory (never persisted: a refresh on every page
 * load goes through the HttpOnly cookie + SSR loader). All mutating actions
 * route through the API client, so 401 auto-refresh and rate-limit retries
 * apply uniformly. `logout` clears local state and also drops the CSRF cookie
 * client-side as a belt-and-braces measure even if the server-side delete
 * succeeded.
 */
export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  accessToken: null,
  async forgotPassword(input) {
    await api.post('/auth/password/forgot', input);
  },

  async login(input) {
    const payload = await api.post<{ accessToken: string; user: User }>('/auth/login', input);
    set({ accessToken: payload.accessToken, user: payload.user });
  },

  async logout(options) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    try {
      await api.post('/auth/logout', undefined, { 'x-csrf-token': csrfToken ?? '' });
    } catch {
      // ignore server logout errors
    }
    set({ accessToken: null, user: null });
    deleteCookie(CSRF_COOKIE_NAME);
    await options?.afterClear?.();
  },

  async refresh() {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (!csrfToken) return false;

    try {
      const payload = await api.post<{ accessToken: string; user: User }>(
        '/auth/refresh',
        undefined,
        { 'x-csrf-token': csrfToken },
      );
      set({ accessToken: payload.accessToken, user: payload.user });
      return true;
    } catch (error) {
      // Only clear the session for real auth failures (401/403). Transient
      // errors (rate limit, network blip, 5xx) must not log the user out —
      // they retain their token and the next request can succeed.
      const isAuthFailure =
        error instanceof ApiClientError && (error.status === 401 || error.status === 403);
      if (isAuthFailure) {
        set({ accessToken: null, user: null });
        deleteCookie(CSRF_COOKIE_NAME);
      }
      return false;
    }
  },

  async register(input) {
    const payload = await api.post<{ accessToken: string; user: User }>('/auth/register', input);
    set({ accessToken: payload.accessToken, user: payload.user });
  },

  async resetPassword(input) {
    await api.post('/auth/password/reset', input);
  },

  setSession(input) {
    const patch: Partial<AuthState> = {};
    if ('user' in input) patch.user = input.user ?? null;
    if ('accessToken' in input) patch.accessToken = input.accessToken ?? null;
    set(patch);
  },

  user: null,
}));
