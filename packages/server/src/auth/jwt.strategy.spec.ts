import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

describe('jwtStrategy', () => {
  it('extracts sub + email from the verified JWT payload', () => {
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    const strategy = new JwtStrategy(config);

    const out = strategy.validate({ sub: 'u-1', email: 'a@b.c' });

    expect(out).toStrictEqual({ sub: 'u-1', email: 'a@b.c' });
  });
});
