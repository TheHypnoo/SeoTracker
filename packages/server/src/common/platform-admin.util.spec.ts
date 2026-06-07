import { describe, expect, it } from '@jest/globals';

import { isPlatformAdmin, parsePlatformAdminEmails } from './platform-admin.util';

describe('platformAdmin util', () => {
  it('parses a comma-separated list, trimming and lowercasing', () => {
    expect(parsePlatformAdminEmails(' Admin@X.com , ops@x.com ,')).toStrictEqual(
      new Set(['admin@x.com', 'ops@x.com']),
    );
  });

  it('returns an empty set when the env is undefined or empty', () => {
    expect(parsePlatformAdminEmails(undefined).size).toBe(0);
    expect(parsePlatformAdminEmails('').size).toBe(0);
  });

  it('matches the user email case-insensitively', () => {
    expect(isPlatformAdmin('ADMIN@x.com', 'admin@x.com')).toBe(true);
    expect(isPlatformAdmin('someone@x.com', 'admin@x.com')).toBe(false);
  });

  it('returns false when the email or allowlist is missing', () => {
    expect(isPlatformAdmin(undefined, 'admin@x.com')).toBe(false);
    expect(isPlatformAdmin('admin@x.com', undefined)).toBe(false);
  });
});
