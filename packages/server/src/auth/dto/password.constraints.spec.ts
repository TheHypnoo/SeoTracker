import { describe, expect, it } from '@jest/globals';
import 'reflect-metadata';
import { validate } from 'class-validator';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, StrongPassword } from './password.constraints';

class Sample {
  @StrongPassword()
  password!: string;
}

async function check(password: string) {
  const obj = new Sample();
  obj.password = password;
  const errors = await validate(obj);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('strongPassword (decorator)', () => {
  it('rejects passwords shorter than the minimum', async () => {
    const errs = await check('Ab1');
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects passwords without a digit', async () => {
    const errs = await check('OnlyLettersHere');
    expect(errs.some((m) => m.includes('letter and one number'))).toBe(true);
  });

  it('rejects passwords without a letter', async () => {
    const errs = await check('1234567890123');
    expect(errs.some((m) => m.includes('letter and one number'))).toBe(true);
  });

  it('rejects passwords longer than max', async () => {
    const errs = await check(`a1${'x'.repeat(PASSWORD_MAX_LENGTH)}`);
    expect(errs.some((m) => m.includes('most'))).toBe(true);
  });

  it('accepts a password with min-length, ≥1 letter, ≥1 digit', async () => {
    const errs = await check(`${'a'.repeat(PASSWORD_MIN_LENGTH - 1)}1`);
    expect(errs).toStrictEqual([]);
  });
});
