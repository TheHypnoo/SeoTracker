import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
// oxlint-disable jest/no-confusing-set-timeout -- false positive: this file does not use jest.setTimeout

import { lookup } from 'node:dns/promises';

import { safeFetch, SsrfBlockedError } from './safe-fetch';

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

  it('throws when redirect chain exceeds maxRedirects', async () => {
    fetchSpy.mockResolvedValue(makeResponse(302, { location: 'https://example.com/loop' }));

    await expect(safeFetch('https://example.com/', { maxRedirects: 2 })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});
