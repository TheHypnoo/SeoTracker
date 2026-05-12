import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@seotracker/shared-types';

import { ProjectsService } from '../../projects/projects.service';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionGuard } from './permission.guard';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function mockExecutionContext(opts: {
  permission?: Permission;
  user?: { sub?: string } | null;
  params?: Record<string, string>;
}) {
  const handler = jest.fn();
  const cls = jest.fn();
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user: opts.user, params: opts.params ?? {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('permissionGuard', () => {
  let reflector: Reflector;
  let projectsService: { assertPermission: jest.Mock };
  let db: { select: jest.Mock; from: jest.Mock; where: jest.Mock };
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = new Reflector();
    projectsService = { assertPermission: jest.fn().mockResolvedValue(undefined) };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
    };
    guard = new PermissionGuard(
      reflector,
      projectsService as unknown as ProjectsService,
      db as never,
    );
  });

  it('allows the request when no @RequirePermission metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = mockExecutionContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(projectsService.assertPermission).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the request is not authenticated', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permission.AUDIT_RUN);
    const ctx = mockExecutionContext({ user: null, params: { projectId: 'p1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses :projectId from params directly without DB lookup', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permission.MEMBERS_INVITE);

    const ctx = mockExecutionContext({
      user: { sub: 'u1' },
      params: { projectId: 'p1' },
    });

    await guard.canActivate(ctx);

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'p1',
      'u1',
      Permission.MEMBERS_INVITE,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('resolves projectId via :siteId when projectId is absent', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permission.AUDIT_RUN);
    db.where.mockReturnValueOnce(thenable([{ projectId: 'p1-from-site' }]));

    const ctx = mockExecutionContext({
      user: { sub: 'u1' },
      params: { siteId: 'site-1' },
    });

    await guard.canActivate(ctx);

    expect(db.select).toHaveBeenCalled();
    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'p1-from-site',
      'u1',
      Permission.AUDIT_RUN,
    );
  });

  it('throws InternalServerErrorException when neither projectId nor siteId is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permission.AUDIT_RUN);
    const ctx = mockExecutionContext({
      user: { sub: 'u1' },
      params: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws InternalServerErrorException when the site does not resolve to a project', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permission.AUDIT_RUN);
    db.where.mockReturnValueOnce(thenable([])); // empty — site not found

    const ctx = mockExecutionContext({
      user: { sub: 'u1' },
      params: { siteId: 'unknown-site' },
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rEQUIRED_PERMISSION_KEY constant is consistent with the decorator metadata', () => {
    expect(REQUIRED_PERMISSION_KEY).toBe('required_permission');
  });
});
