import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteCookie, getCookie } from './cookies';

describe('cookie helpers', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    document.cookie = 'plain=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'csrf.token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
  });

  it('reads URL-decoded cookies and escapes special characters in the name', () => {
    document.cookie = `csrf.token=${encodeURIComponent('value with spaces')}; path=/`;

    expect(getCookie('csrf.token')).toBe('value with spaces');
    expect(getCookie('csrf-token')).toBeNull();
  });

  it('returns null when document is not available', () => {
    vi.stubGlobal('document', undefined);

    expect(getCookie('csrf.token')).toBeNull();
  });

  it('deletes a localhost cookie without adding domain variants', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'localhost' },
    });
    document.cookie = 'plain=present; path=/';

    deleteCookie('plain');

    expect(getCookie('plain')).toBeNull();
  });

  it('attempts host and parent-domain deletes outside localhost', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.example.com' },
    });
    const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set');

    deleteCookie('refresh_token');

    expect(cookieSetter).toHaveBeenCalledWith(
      'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/',
    );
    expect(cookieSetter).toHaveBeenCalledWith(
      'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=app.example.com',
    );
    expect(cookieSetter).toHaveBeenCalledWith(
      'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.example.com',
    );
  });

  it('does not add a parent-domain delete for bare hostnames', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'example.com' },
    });
    const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set');

    deleteCookie('refresh_token');

    expect(cookieSetter).toHaveBeenCalledTimes(2);
    expect(cookieSetter).toHaveBeenLastCalledWith(
      'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=example.com',
    );
  });

  it('does nothing when document is not available', () => {
    vi.stubGlobal('document', undefined);

    expect(() => deleteCookie('refresh_token')).not.toThrow();
  });
});
