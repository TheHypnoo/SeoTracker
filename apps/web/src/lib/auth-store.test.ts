import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth-store';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown) {
  // 204 No Content responses cannot carry a body per the Fetch spec.
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json' },
  };
  return new Response(status === 204 ? null : JSON.stringify(body), init);
}

function setCsrfCookie(value: string | null) {
  // jsdom honors document.cookie. Setting "name=" with past expiry deletes it.
  if (value === null) {
    document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  } else {
    document.cookie = `csrf_token=${value}; path=/`;
  }
}

describe('useAuthStore', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ accessToken: null, user: null });
    setCsrfCookie(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setCsrfCookie(null);
  });

  it('login stores accessToken and user from server payload', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: 'tok-123',
        user: { id: 'u1', email: 'a@b.c', name: 'Alice' },
      }),
    );

    await useAuthStore.getState().login({ email: 'a@b.c', password: 'pw' });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('tok-123');
    expect(state.user).toEqual({ id: 'u1', email: 'a@b.c', name: 'Alice' });
  });

  it('register stores session and lets server-side cookies flow', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'tok-r', user: { id: 'u', email: 'r@x', name: 'R' } }),
    );

    await useAuthStore.getState().register({ name: 'R', email: 'r@x', password: 'pw' });

    expect(useAuthStore.getState().accessToken).toBe('tok-r');
    expect(useAuthStore.getState().user?.email).toBe('r@x');
  });

  it('refresh returns false when no CSRF cookie is present (no network call)', async () => {
    const ok = await useAuthStore.getState().refresh();
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresh updates session on 200', async () => {
    setCsrfCookie('csrf-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'rotated', user: { id: 'u', email: 'a', name: 'A' } }),
    );

    const ok = await useAuthStore.getState().refresh();

    expect(ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('rotated');
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/auth/refresh');
  });

  it('refresh on 401 clears the session (real auth failure)', async () => {
    setCsrfCookie('csrf-1');
    useAuthStore.setState({ accessToken: 'old', user: { id: 'u', email: 'e', name: 'n' } });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }));

    const ok = await useAuthStore.getState().refresh();

    expect(ok).toBe(false);
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it('refresh on 403 clears the session', async () => {
    setCsrfCookie('csrf-1');
    useAuthStore.setState({ accessToken: 'old', user: { id: 'u', email: 'e', name: 'n' } });
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'forbidden' }));

    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('refresh on 429 (rate limit) keeps the existing session intact', async () => {
    setCsrfCookie('csrf-1');
    useAuthStore.setState({ accessToken: 'keep', user: { id: 'u', email: 'e', name: 'n' } });
    // ApiClient retries 429 internally; eventually surface the 429 error.
    fetchMock.mockResolvedValue(jsonResponse(429, { message: 'slow' }));

    const ok = await useAuthStore.getState().refresh();

    expect(ok).toBe(false);
    // Critical: the store MUST NOT log out on transient errors.
    expect(useAuthStore.getState().accessToken).toBe('keep');
    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it('refresh on 500 (transient) keeps the existing session intact', async () => {
    setCsrfCookie('csrf-1');
    useAuthStore.setState({ accessToken: 'keep', user: { id: 'u', email: 'e', name: 'n' } });
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'oops' }));

    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().accessToken).toBe('keep');
  });

  it('logout calls server with CSRF header and clears local state', async () => {
    setCsrfCookie('csrf-X');
    useAuthStore.setState({ accessToken: 'tok', user: { id: 'u', email: 'e', name: 'n' } });
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));

    const afterClear = vi.fn();
    await useAuthStore.getState().logout({ afterClear });

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(afterClear).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('csrf-X');
  });

  it('logout still clears local state when the server call fails', async () => {
    useAuthStore.setState({ accessToken: 'tok', user: { id: 'u', email: 'e', name: 'n' } });
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('forgotPassword posts and resolves regardless of email existence', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));
    await expect(
      useAuthStore.getState().forgotPassword({ email: 'unknown@x' }),
    ).resolves.toBeUndefined();
  });

  it('resetPassword posts the token and password', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));
    await useAuthStore.getState().resetPassword({ token: 't', password: 'newpw' });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ token: 't', password: 'newpw' });
  });

  it('setSession is partial: only patches fields explicitly provided', () => {
    useAuthStore.setState({ accessToken: 'a', user: { id: 'u', email: 'e', name: 'n' } });

    useAuthStore.getState().setSession({ user: null });

    expect(useAuthStore.getState().accessToken).toBe('a');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
