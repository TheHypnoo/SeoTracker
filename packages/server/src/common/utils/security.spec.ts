import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';

import { hashToken, randomToken, safeEqual } from './security';

describe('security utils', () => {
  it('uses the default token size when none is provided', () => {
    expect(randomToken()).toMatch(/^[a-f0-9]{96}$/);
  });

  it('generates hexadecimal random tokens with the requested byte size', () => {
    const token = randomToken(4);

    expect(token).toMatch(/^[a-f0-9]{8}$/);
  });

  it('hashes tokens with sha256 hex output', () => {
    expect(hashToken('secret')).toBe(createHash('sha256').update('secret').digest('hex'));
  });

  it('compares equal same-length strings with timingSafeEqual', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different same-length and different-length values', () => {
    expect([safeEqual('abc123', 'abc124'), safeEqual('abc123', 'short')]).toStrictEqual([
      false,
      false,
    ]);
  });
});
