import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../config/env.schema';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from './jwt.constants';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService<Env, true>) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_ACCESS_SECRET', { infer: true }),
      // Reject tokens not minted by our own auth service — without these
      // checks any JWT signed with the same secret would be accepted.
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALGORITHM],
    });
  }

  validate(payload: JwtPayload): CurrentUserPayload {
    return {
      email: payload.email,
      sub: payload.sub,
    };
  }
}
