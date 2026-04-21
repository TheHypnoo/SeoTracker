import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Permission, Role } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from './projects.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  onConflictDoNothing: jest.Mock;
  returning: jest.Mock;
  delete: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    returning: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

/**
 * Behavioural tests for ProjectsService — focused on the new permission
 * subsystem (assertPermission, getEffectivePermissions, validateOverrides,
 * updateMemberPermissions). Existing role-shape tests are in
 * projects.service.spec.ts.
 */
describe('ProjectsService permissions', () => {
  let service: ProjectsService;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DRIZZLE, useValue: db },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ProjectsService);
  });

  describe('getEffectivePermissions', () => {
    it('returns null when the user is not a member', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      const result = await service.getEffectivePermissions('p1', 'u-stranger');
      expect(result).toBeNull();
    });

    it('returns the role defaults when there are no overrides', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.MEMBER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      const result = await service.getEffectivePermissions('p1', 'u1');
      expect(result).not.toBeNull();
      expect(result?.has(Permission.AUDIT_RUN)).toBe(true);
      expect(result?.has(Permission.PROJECT_DELETE)).toBe(false);
    });

    it('applies extras and revoked correctly', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.VIEWER,
            extraPermissions: [Permission.AUDIT_RUN],
            revokedPermissions: [Permission.SITE_READ],
          },
        ]),
      );

      const result = await service.getEffectivePermissions('p1', 'u1');
      expect(result?.has(Permission.AUDIT_RUN)).toBe(true); // extra
      expect(result?.has(Permission.SITE_READ)).toBe(false); // revoked
    });

    it('OWNER always has every permission regardless of stored overrides', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u-owner',
            role: Role.OWNER,
            extraPermissions: [],
            // pretend stored revoked accidentally has AUDIT_RUN — should be ignored
            revokedPermissions: [Permission.AUDIT_RUN],
          },
        ]),
      );

      const result = await service.getEffectivePermissions('p1', 'u-owner');
      expect(result?.has(Permission.AUDIT_RUN)).toBe(true);
      expect(result?.has(Permission.PROJECT_DELETE)).toBe(true);
    });
  });

  describe('assertPermission', () => {
    it('throws ForbiddenException("Not a project member") for non-members', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(
        service.assertPermission('p1', 'u-stranger', Permission.SITE_READ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException("Missing permission: ...") for members lacking it', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.VIEWER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      await expect(service.assertPermission('p1', 'u1', Permission.AUDIT_RUN)).rejects.toThrow(
        /Missing permission/,
      );
    });

    it('passes silently when the user has the permission', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.MEMBER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      await expect(
        service.assertPermission('p1', 'u1', Permission.AUDIT_RUN),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateOverrides', () => {
    it('rejects extras containing OWNER-exclusive perms', () => {
      expect(() => service.validateOverrides(Role.MEMBER, [Permission.PROJECT_DELETE], [])).toThrow(
        BadRequestException,
      );
    });

    it('rejects extras containing OWNER-exclusive perms even for VIEWER', () => {
      expect(() => service.validateOverrides(Role.VIEWER, [Permission.MEMBERS_REMOVE], [])).toThrow(
        BadRequestException,
      );
    });

    it('rejects revoking a perm that is not in the role defaults', () => {
      // VIEWER doesn't include AUDIT_RUN by default, so revoking it makes no sense.
      expect(() => service.validateOverrides(Role.VIEWER, [], [Permission.AUDIT_RUN])).toThrow(
        BadRequestException,
      );
    });

    it('rejects ANY override on OWNER role', () => {
      expect(() => service.validateOverrides(Role.OWNER, [Permission.AUDIT_RUN], [])).toThrow(
        BadRequestException,
      );
      expect(() => service.validateOverrides(Role.OWNER, [], [Permission.SITE_READ])).toThrow(
        BadRequestException,
      );
    });

    it('accepts a valid extras+revoked combination', () => {
      expect(() =>
        service.validateOverrides(
          Role.MEMBER,
          [Permission.WEBHOOK_WRITE], // grantable, non-default
          [Permission.SITE_DELETE], // default for MEMBER
        ),
      ).not.toThrow();
    });
  });

  describe('updateMemberPermissions', () => {
    it('rejects non-owner actor', async () => {
      db.where.mockReturnValueOnce(
        // assertPermission lookup for actor
        thenable([
          {
            projectId: 'p1',
            userId: 'actor',
            role: Role.MEMBER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      await expect(
        service.updateMemberPermissions('p1', 'target', 'actor', { role: Role.VIEWER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the target member does not exist', async () => {
      db.where
        // actor lookup — owner
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        // target lookup — empty
        .mockReturnValueOnce(thenable([]));

      await expect(
        service.updateMemberPermissions('p1', 'target', 'owner', { role: Role.VIEWER }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to modify another OWNER', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'other-owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        );

      await expect(
        service.updateMemberPermissions('p1', 'other-owner', 'owner', { role: Role.MEMBER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to promote a member to OWNER through this endpoint', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.MEMBER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        );

      await expect(
        service.updateMemberPermissions('p1', 'target', 'owner', { role: Role.OWNER }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates role and resets overrides on role change', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.MEMBER,
              extraPermissions: [Permission.WEBHOOK_WRITE],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(db as unknown as never) // update
        // refetch membership after update
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.VIEWER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        );

      await service.updateMemberPermissions('p1', 'target', 'owner', {
        role: Role.VIEWER,
        // these are silently dropped because role changed → overrides reset.
        extraPermissions: [Permission.AUDIT_RUN],
        revokedPermissions: [Permission.PROJECT_VIEW],
      });

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          role: Role.VIEWER,
          extraPermissions: [],
          revokedPermissions: [],
        }),
      );
    });

    it('persists explicit extras/revoked when role does not change', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.MEMBER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(db as unknown as never)
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.MEMBER,
              extraPermissions: [Permission.WEBHOOK_WRITE],
              revokedPermissions: [Permission.SITE_DELETE],
            },
          ]),
        );

      await service.updateMemberPermissions('p1', 'target', 'owner', {
        extraPermissions: [Permission.WEBHOOK_WRITE],
        revokedPermissions: [Permission.SITE_DELETE],
      });

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          extraPermissions: [Permission.WEBHOOK_WRITE],
          revokedPermissions: [Permission.SITE_DELETE],
        }),
      );
    });

    it('rejects an attempt to grant an OWNER-exclusive perm to non-owner', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'owner',
              role: Role.OWNER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              projectId: 'p1',
              userId: 'target',
              role: Role.MEMBER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        );

      await expect(
        service.updateMemberPermissions('p1', 'target', 'owner', {
          extraPermissions: [Permission.MEMBERS_INVITE],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('addMember with overrides', () => {
    it('persists default empty overrides', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.MEMBER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      await service.addMember('p1', 'u1', Role.MEMBER);

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          role: Role.MEMBER,
          extraPermissions: [],
          revokedPermissions: [],
        }),
      );
    });

    it('persists provided extras/revoked after validation', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            projectId: 'p1',
            userId: 'u1',
            role: Role.VIEWER,
            extraPermissions: [Permission.AUDIT_RUN],
            revokedPermissions: [],
          },
        ]),
      );

      await service.addMember('p1', 'u1', Role.VIEWER, [Permission.AUDIT_RUN], []);

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          extraPermissions: [Permission.AUDIT_RUN],
          revokedPermissions: [],
        }),
      );
    });

    it('rejects providing OWNER-exclusive permission as extra', async () => {
      await expect(
        service.addMember('p1', 'u1', Role.MEMBER, [Permission.PROJECT_DELETE], []),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
