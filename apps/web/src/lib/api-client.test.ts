import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
type RefreshSessionMock = () => Promise<boolean>;
type FetchCallWithInit = [RequestInfo | URL, RequestInit];

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe(ApiClient, () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches Bearer access token and credentials on every request', async () => {
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token-abc',
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await client.get('/me');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as FetchCallWithInit;
    expect(url).toBe('http://api.test/me');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
  });

  it('returns parsed JSON on 2xx', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }));

    const result = await client.get<{ id: string }>('/x');

    expect(result).toStrictEqual({ id: 'x' });
  });

  it('returns undefined on 204', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await client.delete<undefined>('/x');

    expect(result).toBeUndefined();
  });

  it('refreshes session once on 401 and retries the original request', async () => {
    const refreshSession = vi.fn<RefreshSessionMock>().mockResolvedValue(true);
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      refreshSession,
      maxRetries: 0,
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await client.get<{ ok: boolean }>('/me');

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual({ ok: true });
  });

  it('refreshes before protected requests when no access token is in memory', async () => {
    let token: string | null = null;
    const refreshSession = vi.fn<RefreshSessionMock>().mockImplementation(() => {
      token = 'token-after-refresh';
      return Promise.resolve(true);
    });
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => token,
      refreshSession,
      maxRetries: 0,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await client.get<{ ok: boolean }>('/projects');

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as FetchCallWithInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-after-refresh',
    );
    expect(result).toStrictEqual({ ok: true });
  });

  it('does not pre-refresh credential bootstrap requests', async () => {
    const refreshSession = vi.fn<RefreshSessionMock>().mockResolvedValue(true);
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      refreshSession,
      maxRetries: 0,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { accessToken: 't', user: { id: 'u1' } }));

    await client.post('/auth/login', { email: 'a@b.c', password: 'pw' });

    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not refresh when the failing request is /auth/refresh itself', async () => {
    const refreshSession = vi.fn<RefreshSessionMock>().mockResolvedValue(true);
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      refreshSession,
      maxRetries: 0,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'no' }));

    await expect(client.post('/auth/refresh')).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('surfaces ApiClientError with status and parsed message', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { message: 'Email already registered' }));

    await expect(client.post('/auth/register', {})).rejects.toMatchObject({
      status: 409,
      message: 'Email already registered',
    });
  });

  it('joins NestJS validation array messages', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock.mockResolvedValue(
      jsonResponse(400, { message: ['email must be valid', 'password too short'] }),
    );

    await expect(client.post('/x', {})).rejects.toMatchObject({
      status: 400,
      message: 'email must be valid. password too short',
    });
    await expect(client.post('/x', {}).catch((error: unknown) => error)).resolves.toBeInstanceOf(
      ApiClientError,
    );
  });

  it('flags rate limit and parses Retry-After (seconds)', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock.mockResolvedValue(
      jsonResponse(429, { message: 'slow down' }, { 'retry-after': '7' }),
    );

    const caught: unknown = await client.post('/x', {}).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiClientError);
    const err = caught as ApiClientError;
    expect(err.isRateLimited).toBeTruthy();
    expect(err.retryAfterMs).toBe(7000);
  });

  it('does not retry 429 so callers can enter a shared cooldown', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 1, timeoutMs: 5000 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { message: 'slow' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(client.get<{ ok: boolean }>('/x')).rejects.toMatchObject({
      status: 429,
      message: 'slow',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries transient 5xx on GET but not on POST', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 1 });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { message: 'busy' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(client.get('/x')).resolves.toStrictEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { message: 'busy' }));
    await expect(client.post('/x', {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent GETs to the same path (in-flight cache)', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    let resolveFn: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFn = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    const a = client.get('/x');
    const b = client.get('/x');

    expect(fetchMock).toHaveBeenCalledOnce();
    resolveFn(jsonResponse(200, { ok: true }));
    await Promise.all([a, b]);
  });

  it('invokes onUnauthorized when the final response is 401', async () => {
    const onUnauthorized = vi.fn<() => void>();
    const refreshSession = vi.fn<RefreshSessionMock>().mockResolvedValue(false);
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      refreshSession,
      onUnauthorized,
      maxRetries: 0,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'no' }));

    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent 401s into one refresh call', async () => {
    let refreshes = 0;
    const refreshSession = vi.fn<RefreshSessionMock>().mockImplementation(() => {
      refreshes += 1;
      return new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 10);
      });
    });
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      refreshSession,
      maxRetries: 0,
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 2 }));

    const [a, b] = await Promise.all([client.post('/a', {}), client.post('/b', {})]);

    expect(refreshes).toBe(1);
    expect(a).toStrictEqual({ ok: 1 });
    expect(b).toStrictEqual({ ok: 2 });
  });
});
