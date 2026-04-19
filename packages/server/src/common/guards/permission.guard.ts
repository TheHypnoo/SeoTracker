import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { sites } from '../../database/schema';
import { ProjectsService } from '../../projects/projects.service';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Reads the `@RequirePermission(perm)` metadata, picks the projectId from
 * the route (either directly via `:projectId` or indirectly via `:siteId`),
 * and asks ProjectsService.assertPermission to authorize the caller.
 *
 * Designed to chain after JwtAuthGuard (which sets `req.user.sub`).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectsService: ProjectsService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Unauthenticated');
    }

    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const projectId = params.projectId ?? (await this.resolveProjectIdFromSite(params.siteId));
    if (!projectId) {
      throw new InternalServerErrorException(
        'PermissionGuard could not resolve a projectId from the route',
      );
    }

    await this.projectsService.assertPermission(projectId, userId, required);
    return true;
  }

  private async resolveProjectIdFromSite(siteId: string | undefined): Promise<string | null> {
    if (!siteId) return null;
    const [row] = await this.db
      .select({ projectId: sites.projectId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1);
    return row?.projectId ?? null;
  }
}
