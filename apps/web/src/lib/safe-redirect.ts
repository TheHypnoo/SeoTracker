/**
 * Validate a `?redirect=` target before navigating to it.
 *
 * Only same-origin absolute paths are allowed. Absolute URLs
 * (`https://evil.com`), protocol-relative URLs (`//evil.com`) and backslash
 * variants (`/\evil.com`) are rejected and replaced with the fallback so a
 * crafted login link cannot bounce an authenticated user to an attacker site
 * (open-redirect phishing).
 */
export function safeRedirectPath(target: unknown, fallback = '/dashboard'): string {
  if (typeof target !== 'string' || target.length === 0) {
    return fallback;
  }
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return fallback;
  }
  return target;
}
