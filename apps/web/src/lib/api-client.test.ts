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

  it('aborts requests when the timeout elapses', async () => {
    vi.useFakeTimers();
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0, timeoutMs: 10 });
    fetchMock.mockImplementationOnce((_url, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const request = client.get('/slow').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);

    await expect(request).resolves.toMatchObject({ name: 'AbortError' });
    vi.useRealTimers();
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

  it('sends JSON bodies with extra headers for PUT and PATCH', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { updated: true }))
      .mockResolvedValueOnce(jsonResponse(200, { patched: true }));

    await client.put('/projects/1', { name: 'New' }, { 'x-request-id': 'put-1' });
    await client.patch('/projects/1', { name: 'Patch' }, { 'x-request-id': 'patch-1' });

    const [, putInit] = fetchMock.mock.calls[0] as FetchCallWithInit;
    expect(putInit.method).toBe('PUT');
    expect(JSON.parse(putInit.body as string)).toStrictEqual({ name: 'New' });
    expect(putInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-request-id': 'put-1',
    });

    const [, patchInit] = fetchMock.mock.calls[1] as FetchCallWithInit;
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(patchInit.body as string)).toStrictEqual({ name: 'Patch' });
  });

  it('retries network failures for GET and eventually surfaces the final error', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 1 });
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(client.get('/flaky')).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry network failures for unsafe methods', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 2 });
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(client.post('/unsafe', { ok: true })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to default messages when error payload is absent or invalid JSON', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock
      .mockResolvedValueOnce(new Response('not json', { status: 403 }))
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(408, { message: '' }))
      .mockResolvedValueOnce(jsonResponse(502, { message: null }));

    await expect(client.get('/forbidden')).rejects.toMatchObject({
      status: 403,
      message: 'No tienes permisos para realizar esta acción.',
    });
    await expect(client.get('/missing')).rejects.toMatchObject({
      status: 404,
      message: 'Recurso no encontrado.',
    });
    await expect(client.get('/timeout')).rejects.toMatchObject({
      status: 408,
      message: 'La petición ha tardado demasiado. Inténtalo de nuevo.',
    });
    await expect(client.get('/bad-gateway')).rejects.toMatchObject({
      status: 502,
      message: 'Error temporal del servidor. Inténtalo de nuevo en un momento.',
    });
  });

  it('normalizes object validation messages and empty arrays', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { message: { field: 'invalid' } }))
      .mockResolvedValueOnce(jsonResponse(400, { message: [] }))
      .mockResolvedValueOnce(jsonResponse(400, { message: [null, { nested: true }] }));

    await expect(client.post('/object-message', {})).rejects.toMatchObject({
      message: '{"field":"invalid"}',
    });
    await expect(client.post('/empty-array', {})).rejects.toMatchObject({
      message: 'Error 400',
    });
    await expect(client.post('/mixed-array', {})).rejects.toMatchObject({
      message: 'null. {"nested":true}',
    });
  });

  it('parses Retry-After HTTP dates and ignores invalid values', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    vi.setSystemTime(new Date('2026-05-18T10:00:00.000Z'));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(429, {}, { 'retry-after': 'Mon, 18 May 2026 10:00:05 GMT' }),
      )
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': 'invalid' }));

    const dated: unknown = await client.get('/dated').catch((error: unknown) => error);
    expect((dated as ApiClientError).retryAfterMs).toBe(5000);

    const invalid: unknown = await client.get('/invalid').catch((error: unknown) => error);
    expect((invalid as ApiClientError).retryAfterMs).toBeUndefined();
    vi.useRealTimers();
  });

  it('handles non-401 blob errors without invoking unauthorized callbacks', async () => {
    const onUnauthorized = vi.fn<() => void>();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      onUnauthorized,
      maxRetries: 0,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }));

    await expect(client.getBlob('/exports/500')).rejects.toMatchObject({
      status: 500,
      message: 'Error temporal del servidor. Inténtalo de nuevo en un momento.',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('drops empty string validation array entries', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: ['', 'kept'] }));

    await expect(client.post('/array', {})).rejects.toMatchObject({ message: 'kept' });
  });

  it('returns blobs and handles unauthorized blob responses', async () => {
    const onUnauthorized = vi.fn<() => void>();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      onUnauthorized,
      maxRetries: 0,
    });
    fetchMock
      .mockResolvedValueOnce(new Response('csv-body', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }, { 'retry-after': '1' }));

    const blob = await client.getBlob('/exports/1');
    await expect(blob.text()).resolves.toBe('csv-body');

    await expect(client.getBlob('/exports/2')).rejects.toMatchObject({
      status: 401,
      message: 'Sesión expirada. Vuelve a iniciar sesión.',
      retryAfterMs: 1000,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('pre-refreshes protected blob downloads when the access token is missing', async () => {
    let token: string | null = null;
    const refreshSession = vi.fn<RefreshSessionMock>().mockImplementation(() => {
      token = 'blob-token';
      return Promise.resolve(true);
    });
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => token,
      refreshSession,
      maxRetries: 0,
    });
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await client.getBlob('/exports/1');

    expect(refreshSession).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as FetchCallWithInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer blob-token' });
  });

  it('returns false from refreshSession when no refresher is configured', async () => {
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      maxRetries: 0,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(client.get('/protected')).resolves.toStrictEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back when object error messages cannot be serialized', async () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const response = jsonResponse(400, {});
    vi.spyOn(response, 'json').mockResolvedValueOnce({ message: circular });
    const client = new ApiClient({ baseUrl: 'http://api.test', maxRetries: 0 });
    fetchMock.mockResolvedValueOnce(response);

    await expect(client.post('/circular', {})).rejects.toMatchObject({
      status: 400,
      message: 'Error 400',
    });
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
