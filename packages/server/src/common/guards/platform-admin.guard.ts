import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { isPlatformAdmin } from '../platform-admin.util';

/**
 * Restricts a route to platform administrators (the `PLATFORM_ADMIN_EMAILS`
 * allowlist). Must run AFTER JwtAuthGuard so `req.user` is populated — declare
 * it as `@UseGuards(JwtAuthGuard, PlatformAdminGuard)`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
    const email = request.user?.email;
    const raw = this.configService.get('PLATFORM_ADMIN_EMAILS', { infer: true });
    if (!isPlatformAdmin(email, raw)) {
      throw new ForbiddenException('Acceso restringido a administradores de la plataforma');
    }
    return true;
  }
}
