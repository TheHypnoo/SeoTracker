import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ResponseTooLargeError, safeFetch, SsrfBlockedError } from '../common/utils/safe-fetch';
import {
  classifyFetchError,
  isRetriableFetchError,
  isRetriableStatus,
  safeFetchWithRetry,
} from './fetch-with-retry';

jest.mock<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch', () => ({
  // Keep the real error classes; only the network call is stubbed.
  ...jest.requireActual<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch'),
  safeFetch: jest.fn(),
}));

const mockedSafeFetch = jest.mocked(safeFetch);

describe('classifyFetchError', () => {
  it('maps deterministic refusals to stable reasons', () => {
    expect(classifyFetchError(new ResponseTooLargeError('too big'))).toBe('response_too_large');
    expect(classifyFetchError(new SsrfBlockedError('blocked'))).toBe('blocked_by_ssrf_guard');
  });

  it('maps timeout/abort errors to "timeout"', () => {
    expect(classifyFetchError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(
      'timeout',
    );
    expect(classifyFetchError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(
      'timeout',
    );
    expect(classifyFetchError(new Error('The operation was aborted'))).toBe('timeout');
    expect(classifyFetchError({ message: 'connection timeout' })).toBe('timeout');
  });

  it('falls back to the error name for other Error instances', () => {
    expect(classifyFetchError(Object.assign(new Error('boom'), { name: 'CustomError' }))).toBe(
      'CustomError',
    );
    // An Error with an empty name exercises the `error.name || 'error'` branch.
    expect(classifyFetchError(Object.assign(new Error('boom'), { name: '' }))).toBe('error');
  });

  it('returns "error" for non-Error, non-object values', () => {
    expect(classifyFetchError('just a string')).toBe('error');
    expect(classifyFetchError(42)).toBe('error');
    expect(classifyFetchError(null)).toBe('error');
  });
});

describe('isRetriableStatus', () => {
  it('treats 408, 429 and 5xx (except 501) as retriable', () => {
    expect(isRetriableStatus(408)).toBe(true);
    expect(isRetriableStatus(429)).toBe(true);
    expect(isRetriableStatus(500)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
  });

  it('does not retry 501 or non-transient statuses', () => {
    expect(isRetriableStatus(501)).toBe(false);
    expect(isRetriableStatus(200)).toBe(false);
    expect(isRetriableStatus(404)).toBe(false);
  });
});

describe('isRetriableFetchError', () => {
  it('never retries deterministic refusals', () => {
    expect(isRetriableFetchError(new ResponseTooLargeError('too big'))).toBe(false);
    expect(isRetriableFetchError(new SsrfBlockedError('blocked'))).toBe(false);
  });

  it('retries timeouts and TypeErrors', () => {
    expect(isRetriableFetchError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(
      true,
    );
    expect(isRetriableFetchError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries transient network errors matched by message/name', () => {
    expect(isRetriableFetchError(new Error('read ECONNRESET'))).toBe(true);
    expect(isRetriableFetchError(new Error('getaddrinfo ENOTFOUND example.com'))).toBe(true);
    expect(isRetriableFetchError(new Error('terminated'))).toBe(true);
    expect(isRetriableFetchError(new Error('fetch failed'))).toBe(true);
    expect(isRetriableFetchError(new Error('network error'))).toBe(true);
  });

  it('does not retry unrelated errors or non-Error values', () => {
    expect(isRetriableFetchError(new Error('totally unrelated'))).toBe(false);
    expect(isRetriableFetchError('not an error')).toBe(false);
  });
});

describe('safeFetchWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries a retriable status and returns the eventual success', async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));

    const response = await safeFetchWithRetry('https://example.com', {}, 1000);

    expect(response.status).toBe(200);
    expect(mockedSafeFetch).toHaveBeenCalledTimes(2);
  });

  it('returns a non-retriable status without retrying', async () => {
    mockedSafeFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));

    const response = await safeFetchWithRetry('https://example.com', {}, 1000);

    expect(response.status).toBe(404);
    expect(mockedSafeFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on a non-retriable error', async () => {
    const error = new Error('totally unrelated');
    mockedSafeFetch.mockRejectedValueOnce(error);

    await expect(safeFetchWithRetry('https://example.com', {}, 1000)).rejects.toBe(error);
    expect(mockedSafeFetch).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries on repeated retriable errors and throws the last one', async () => {
    const error = new TypeError('fetch failed');
    mockedSafeFetch.mockRejectedValue(error);

    await expect(safeFetchWithRetry('https://example.com', {}, 1000)).rejects.toBe(error);
    // Default AUDIT_FETCH_RETRY_ATTEMPTS is 2.
    expect(mockedSafeFetch).toHaveBeenCalledTimes(2);
  });
});

describe('safeFetchWithRetry back-off delay', () => {
  let previousNodeEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    previousNodeEnv = process.env.NODE_ENV;
    // FETCH_RETRY_BASE_DELAY_MS is 0 under NODE_ENV=test; re-importing the module
    // with a non-test env makes the back-off `setTimeout` actually schedule.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    jest.useRealTimers();
  });

  it('waits between retries when a base delay is configured', async () => {
    let isolatedSafeFetch: typeof safeFetch | undefined;
    let isolatedRetry: typeof safeFetchWithRetry | undefined;
    jest.isolateModules(() => {
      /* oxlint-disable unicorn/prefer-module, node/global-require -- re-import under a non-test NODE_ENV to exercise the back-off path */
      const safeFetchModule =
        require('../common/utils/safe-fetch') as typeof import('../common/utils/safe-fetch');
      const retryModule = require('./fetch-with-retry') as typeof import('./fetch-with-retry');
      /* oxlint-enable unicorn/prefer-module, node/global-require */
      isolatedSafeFetch = safeFetchModule.safeFetch;
      isolatedRetry = retryModule.safeFetchWithRetry;
    });
    const fetchMock = jest.mocked(isolatedSafeFetch as typeof safeFetch);
    fetchMock
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));

    const pending = (isolatedRetry as typeof safeFetchWithRetry)('https://example.com', {}, 1000);
    // Flush the 150ms back-off scheduled before the second attempt.
    await jest.advanceTimersByTimeAsync(150);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
