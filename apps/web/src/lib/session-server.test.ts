import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock TanStack Start before importing the module under test. The real
// `createServerFn(...).handler(fn)` wraps `fn` in plumbing for HTTP
// transport; here we just return `fn` so we can invoke it as a plain async
// function and assert on its behavior.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: <Args extends unknown[], R>(fn: (...args: Args) => R) => fn,
  }),
}));

// `getCookie` / `getRequestHeader` are server-only helpers from TanStack
// Start that read from the per-request context. We replace them with plain
// vi.fn() so each test can stage what the handler will see.
const getCookie = vi.fn<(name: string) => string | undefined>();
const getRequestHeader = vi.fn<(name: string) => string | undefined>();

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: (name: string) => getCookie(name),
  getRequestHeader: (name: string) => getRequestHeader(name),
}));

let fetchMock: ReturnType<typeof vi.fn>;

// Import AFTER the mocks are registered.
import { getServerSession } from './session-server';

function jsonResponse(status: number, body: unknown) {
  // 204 may not carry a body per the Fetch spec; jsdom enforces it.
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json' },
  };
  return new Response(status === 204 ? null : JSON.stringify(body), init);
}

describe('getServerSession (SSR)', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    getCookie.mockReset();
    getRequestHeader.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns EMPTY when there is no refresh_token cookie (no network call)', async () => {
    getCookie.mockReturnValue(undefined);

    const result = await getServerSession();

    expect(result).toEqual({ user: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the entire incoming Cookie header to /auth/session', async () => {
    getCookie.mockImplementation((name) => (name === 'refresh_token' ? 'rt-abc' : undefined));
    getRequestHeader.mockReturnValue('refresh_token=rt-abc; csrf_token=csrf-xyz');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'u1', email: 'a@b.c', name: 'Alice' }));

    await getServerSession();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/session');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.cookie).toBe('refresh_token=rt-abc; csrf_token=csrf-xyz');
    // Method must be GET — the whole point is read-only, no token rotation.
    expect((init as RequestInit).method).toBe('GET');
  });

  it('returns EMPTY when fetch itself throws (network/SSR offline)', async () => {
    getCookie.mockReturnValue('rt-abc');
    getRequestHeader.mockReturnValue('');
    fetchMock.mockRejectedValueOnce(new Error('econnrefused'));

    const result = await getServerSession();

    expect(result).toEqual({ user: null });
  });

  it('returns EMPTY on non-2xx (e.g. 401 expired refresh token)', async () => {
    getCookie.mockReturnValue('rt-abc');
    getRequestHeader.mockReturnValue('');
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }));

    const result = await getServerSession();

    expect(result).toEqual({ user: null });
  });

  it('returns EMPTY when the response body cannot be parsed as JSON', async () => {
    getCookie.mockReturnValue('rt-abc');
    getRequestHeader.mockReturnValue('');
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );

    const result = await getServerSession();

    expect(result).toEqual({ user: null });
  });

  it('returns EMPTY when the parsed user has no id (defensive)', async () => {
    getCookie.mockReturnValue('rt-abc');
    getRequestHeader.mockReturnValue('');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: 'a@b.c' }));

    const result = await getServerSession();

    expect(result).toEqual({ user: null });
  });

  it('returns the user on a valid 200 response', async () => {
    getCookie.mockReturnValue('rt-abc');
    getRequestHeader.mockReturnValue('refresh_token=rt-abc');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'u1', email: 'a@b.c', name: 'Alice' }));

    const result = await getServerSession();

    expect(result).toEqual({ user: { id: 'u1', email: 'a@b.c', name: 'Alice' } });
  });
});
