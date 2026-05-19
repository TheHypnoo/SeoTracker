import { describe, expect, it } from '@jest/globals';

import { assertPresent } from './assert';

describe('assertPresent', () => {
  it('returns non-nullish values unchanged', () => {
    const value = { id: 'x' };

    expect(assertPresent(value, 'missing')).toBe(value);
  });

  it('throws the provided message for nullish values', () => {
    expect(() => assertPresent(null, 'missing value')).toThrow('missing value');
    expect(() => assertPresent(undefined, 'missing value')).toThrow('missing value');
  });
});
