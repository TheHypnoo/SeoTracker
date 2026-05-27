import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { isPrivateHostname } from './domain';

export type SafeFetchOptions = Omit<RequestInit, 'redirect'> & { maxRedirects?: number };

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

const DEFAULT_MAX_REDIRECTS = 5;

export async function assertSafeFetchUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? input : new URL(input);
  await assertSafeUrl(url);
  return url;
}

async function assertSafeUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Disallowed protocol "${url.protocol}"`);
  }
  if (isPrivateHostname(url.hostname)) {
    throw new SsrfBlockedError(`Private or link-local host blocked: ${url.hostname}`);
  }

  const lookupHostname = normalizeLookupHostname(url.hostname);
  if (isIP(lookupHostname)) {
    return;
  }

  const addresses = await lookup(lookupHostname, { all: true, verbatim: false });
  for (const { address } of addresses) {
    if (isPrivateHostname(address)) {
      throw new SsrfBlockedError(
        `Private or link-local address blocked for ${url.hostname}: ${address}`,
      );
    }
  }
}

function normalizeLookupHostname(hostname: string) {
  return hostname.replace(/^\[(.*)]$/, '$1');
}

/**
 * fetch() that validates the host on every hop instead of trusting the runtime
 * to follow redirects. Defends against SSRF where the upstream 30x'es to
 * 169.254.169.254, 127.0.0.1, etc. Use this instead of global fetch() for any
 * URL that originates from user input.
 */
export async function safeFetch(input: string, init: SafeFetchOptions = {}): Promise<Response> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...rest } = init;

  let currentUrl = await assertSafeFetchUrl(input);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetch(currentUrl, { ...rest, redirect: 'manual' });

    if (response.status < 300 || response.status >= 400) {
      Object.defineProperty(response, 'url', { value: currentUrl.toString() });
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      Object.defineProperty(response, 'url', { value: currentUrl.toString() });
      return response;
    }

    const nextUrl = await assertSafeFetchUrl(new URL(location, currentUrl));

    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        rest.method &&
        rest.method.toUpperCase() !== 'GET' &&
        rest.method.toUpperCase() !== 'HEAD')
    ) {
      // Follow as GET per HTTP semantics.
      rest.method = 'GET';
      delete (rest as { body?: unknown }).body;
    }

    currentUrl = nextUrl;
  }

  throw new SsrfBlockedError(`Too many redirects (max ${maxRedirects})`);
}

export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read a Response body as text but stop at `maxBytes`. Plain `response.text()`
 * has no upper bound and a hostile server (or a redirect to a multi-GB file)
 * would OOM the worker. We:
 *   1. short-circuit on the Content-Length header when it already declares too
 *      many bytes;
 *   2. stream the body and abort the reader as soon as the running total
 *      exceeds the limit.
 *
 * Defaults to 5 MiB which comfortably fits the HTML/sitemap pages we audit
 * but is small enough that a runaway server can't blow up the heap.
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes = 5 * 1024 * 1024,
): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new ResponseTooLargeError(
        `Response Content-Length ${declaredBytes} exceeds limit of ${maxBytes} bytes`,
      );
    }
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError(`Response body exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader already released when we cancelled — ignore.
    }
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
