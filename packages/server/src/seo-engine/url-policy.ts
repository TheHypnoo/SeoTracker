const EXCLUDED_PATH_PREFIXES = ['/cdn-cgi/'] as const;

const EXPECTED_NOINDEX_PATH_PREFIXES = [
  '/account',
  '/accounts',
  '/admin',
  '/app',
  '/auth',
  '/billing',
  '/cart',
  '/checkout',
  '/dashboard',
  '/forgot-password',
  '/login',
  '/logout',
  '/me',
  '/oauth',
  '/order',
  '/orders',
  '/password',
  '/profile',
  '/register',
  '/reset-password',
  '/settings',
  '/sign-in',
  '/sign-up',
  '/signin',
  '/signup',
  '/subscription',
  '/subscriptions',
  '/user',
  '/users',
] as const;

function parsePath(url: string): string | undefined {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isInfrastructureUrl(url: string): boolean {
  const path = parsePath(url);
  if (!path) return false;
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function isExcludedFromSeoCrawl(url: string): boolean {
  const path = parsePath(url);
  if (!path) return false;
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function isExpectedNoindexUrl(url: string): boolean {
  const path = parsePath(url);
  if (!path || path === '/') return false;
  return EXPECTED_NOINDEX_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function isSeoCrawlCandidateUrl(url: string): boolean {
  return !isExcludedFromSeoCrawl(url) && !isExpectedNoindexUrl(url);
}

function pathMatchesPrefix(path: string, rawPrefix: string): boolean {
  const prefix = normalizePathPrefix(rawPrefix);
  if (!prefix) return false;
  if (prefix.endsWith('/')) return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

function normalizePathPrefix(prefix: string): string | undefined {
  const trimmed = prefix.trim().toLowerCase();
  if (!trimmed) return;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
