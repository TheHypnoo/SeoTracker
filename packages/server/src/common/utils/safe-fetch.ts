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
