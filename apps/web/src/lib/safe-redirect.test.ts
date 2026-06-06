import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from './safe-redirect';

describe('safe redirect helper', () => {
  it('accepts same-origin absolute paths', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/projects/1/issues?tab=open')).toBe('/projects/1/issues?tab=open');
  });

  it('rejects open-redirect payloads and falls back', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('//evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/\\evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/dashboard');
  });

  it('falls back for non-string or empty values', () => {
    expect(safeRedirectPath(undefined)).toBe('/dashboard');
    expect(safeRedirectPath('')).toBe('/dashboard');
    expect(safeRedirectPath(42)).toBe('/dashboard');
  });

  it('honors a custom fallback', () => {
    expect(safeRedirectPath('//evil.com', '/login')).toBe('/login');
  });
});
