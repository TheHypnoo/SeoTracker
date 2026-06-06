import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
// oxlint-disable jest/no-confusing-set-timeout -- false positive: this file does not use jest.setTimeout

import { lookup } from 'node:dns/promises';

import {
  assertSafeFetchUrl,
  readBodyWithLimit,
  ResponseTooLargeError,
  safeFetch,
  ssrfGuardLookup,
  SsrfBlockedError,
} from './safe-fetch';

jest.mock<typeof import('node:dns/promises')>('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

const lookupMock = jest.mocked(lookup);

function makeResponse(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { headers, status });
}

describe('safeFetch', () => {
  let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchSpy = jest.spyOn(globalThis, 'fetch') as unknown as jest.SpyInstance<
      Promise<Response>,
      Parameters<typeof fetch>
    >;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    lookupMock.mockReset();
  });

  it('returns the response when there are no redirects', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(200));

    const response = await safeFetch('https://example.com/');

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts public IP URLs without DNS lookup', async () => {
    await expect(assertSafeFetchUrl(new URL('https://93.184.216.34/'))).resolves.toBeInstanceOf(
      URL,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects URLs that are not http/https', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an initial URL pointing at a private host', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects an initial URL whose hostname resolves to a private address', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }]);

    await expect(safeFetch('https://internal.example/')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks redirects to a private host', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(302, { location: 'http://169.254.169.254/latest/meta-data' }),
    );

    await expect(safeFetch('https://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks redirects to a hostname that resolves to a private address', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '192.168.1.20', family: 4 }]);
    fetchSpy.mockResolvedValueOnce(makeResponse(302, { location: 'https://internal.example/' }));

    await expect(safeFetch('https://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect chain up to the limit', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(302, { location: 'https://second.example.com/' }))
      .mockResolvedValueOnce(makeResponse(200));

    const response = await safeFetch('https://example.com/');

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns 3xx responses that omit a location header', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(304));

    const response = await safeFetch('https://example.com/freshness');

    expect(response.status).toBe(304);
    expect(response.url).toBe('https://example.com/freshness');
  });

  it('normalizes bracketed hosts and rewrites unsafe redirect methods to GET', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '93.184.216.35', family: 4 }]);
    fetchSpy
      .mockResolvedValueOnce(makeResponse(303, { location: 'https://second.example.com/' }))
      .mockResolvedValueOnce(makeResponse(200));

    const response = await safeFetch('https://[2001:4860:4860::8888]/', {
      body: 'payload',
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ body: 'payload', method: 'POST' });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetchSpy.mock.calls[1]?.[1]).not.toHaveProperty('body');
  });

  it('preserves HEAD/GET methods across 301/302 redirects', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(302, { location: 'https://second.example.com/' }))
      .mockResolvedValueOnce(makeResponse(200));

    await safeFetch('https://example.com/', { method: 'HEAD' });

    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: 'HEAD' });
  });

  it('throws when redirect chain exceeds maxRedirects', async () => {
    fetchSpy.mockResolvedValue(makeResponse(302, { location: 'https://example.com/loop' }));

    await expect(safeFetch('https://example.com/', { maxRedirects: 2 })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});

describe('ssrfGuardLookup', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('returns the validated addresses so undici connects to the resolved IP', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]);

    const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve) => {
      ssrfGuardLookup('example.com', { all: true }, (_err, result) => resolve(result));
    });

    expect(addresses).toStrictEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]);
  });

  it('blocks when the hostname resolves to a private address (defeats DNS rebinding)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    const error = await new Promise<Error | null>((resolve) => {
      ssrfGuardLookup('rebind.example', { all: true }, (err) => resolve(err));
    });

    expect(error).toBeInstanceOf(SsrfBlockedError);
  });

  it('propagates DNS resolution failures', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));

    const error = await new Promise<Error | null>((resolve) => {
      ssrfGuardLookup('does-not-exist.invalid', { all: true }, (err) => resolve(err));
    });

    expect(error?.message).toBe('ENOTFOUND');
  });
});

describe('readBodyWithLimit', () => {
  it('returns the full body when it fits under the limit', async () => {
    const body = 'hello world';
    const response = new Response(body);

    await expect(readBodyWithLimit(response, 1024)).resolves.toBe(body);
  });

  it('rejects up front when Content-Length declares too many bytes', async () => {
    const response = new Response('x'.repeat(10), {
      headers: { 'content-length': '999999' },
    });

    await expect(readBodyWithLimit(response, 100)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('rejects mid-stream when the body grows past the limit', async () => {
    // 4 KB body, 1 KB limit — Content-Length is missing so we discover the
    // overflow only while reading.
    const body = 'x'.repeat(4 * 1024);
    const response = new Response(body);

    await expect(readBodyWithLimit(response, 1024)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('returns empty string when there is no body', async () => {
    const response = new Response(null, { status: 204 });

    await expect(readBodyWithLimit(response, 1024)).resolves.toBe('');
  });
});
