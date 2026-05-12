import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditStatus, AuditTrigger, Permission, Role } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from './projects.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  selectDistinctOn: jest.Mock;
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  onConflictDoNothing: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    selectDistinctOn: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
}

describe('projectsService', () => {
  let service: ProjectsService;
  let db: DbMock;
  let events: { emit: jest.Mock; emitAsync: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    events = { emit: jest.fn(), emitAsync: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DRIZZLE, useValue: db },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = moduleRef.get(ProjectsService);
  });

  describe('createProject', () => {
    it('inserts the project with trimmed name and seeds the OWNER membership', async () => {
      db.returning.mockResolvedValueOnce([{ id: 'p1', name: 'Acme', ownerUserId: 'u1' }]);

      const out = await service.createProject('u1', '  Acme  ');

      expect(out.id).toBe('p1');
      // Two inserts: projects, then projectMembers (OWNER).
      expect(db.insert).toHaveBeenCalledTimes(2);
      const memberValues = (db.values.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
      expect(memberValues).toMatchObject({
        projectId: 'p1',
        userId: 'u1',
        role: Role.OWNER,
      });
    });
  });

  describe('getProjectForUser', () => {
    it('throws NotFoundException when the user is not a member', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.getProjectForUser('p-foreign', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the project + role + effectivePermissions when the user is a member', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            id: 'p1',
            name: 'Acme',
            ownerUserId: 'u1',
            createdAt: new Date('2026-01-01'),
            role: Role.MEMBER,
            extraPermissions: [],
            revokedPermissions: [],
          },
        ]),
      );

      const out = await service.getProjectForUser('p1', 'u1');
      expect(out.id).toBe('p1');
      expect(out.name).toBe('Acme');
      expect(out.role).toBe(Role.MEMBER);
      expect(Array.isArray(out.effectivePermissions)).toBe(true);
      // MEMBER default set is non-empty.
      expect(out.effectivePermissions.length).toBeGreaterThan(0);
    });
  });

  describe('updateProject', () => {
    it('requires owner access and stores a trimmed project name', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        .mockReturnValueOnce(db as unknown as never);
      db.returning.mockResolvedValueOnce([{ id: 'p1', name: 'Nuevo', ownerUserId: 'u1' }]);

      const out = await service.updateProject('p1', 'u1', { name: '  Nuevo  ' });

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.set).toHaveBeenCalledWith({ name: 'Nuevo' });
      expect(out.name).toBe('Nuevo');
    });

    it('rejects an empty project name', async () => {
      db.where.mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]));

      await expect(service.updateProject('p1', 'u1', { name: '   ' })).rejects.toThrow(
        'Project name is required',
      );
    });
  });

  describe('deleteProject', () => {
    it('requires project.delete permission and deletes the project', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        .mockResolvedValueOnce(undefined);

      const out = await service.deleteProject('p1', 'u1');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(out).toStrictEqual({ success: true });
    });
  });

  describe('getDashboard', () => {
    const projectRow = {
      id: 'p1',
      name: 'Acme',
      ownerUserId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      role: Role.OWNER,
      extraPermissions: [],
      revokedPermissions: [],
    };

    it('returns an empty dashboard when the project has no sites', async () => {
      db.where.mockReturnValueOnce(thenable([projectRow])).mockReturnValueOnce(thenable([]));

      const out = await service.getDashboard('p1', 'u1');

      expect(out.summary).toStrictEqual({
        activeProjects: 0,
        totalAudits: 0,
        averageScore: null,
        criticalIssues: 0,
        regressions: 0,
        activeAutomations: 0,
      });
      expect(out.trend).toStrictEqual([]);
      expect(out.recentProjects).toStrictEqual([]);
      expect(out.recentAudits).toStrictEqual([]);
      expect(out.activity).toStrictEqual([]);
    });

    it('builds project dashboard metrics, recent activity and trend data', async () => {
      const siteOne = {
        id: 'site-1',
        active: true,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        domain: 'one.test',
        name: 'One',
      };
      const siteTwo = {
        id: 'site-2',
        active: false,
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        domain: 'two.test',
        name: 'Two',
      };
      const completedRun = {
        id: 'run-1',
        siteId: 'site-1',
        score: 90,
        status: AuditStatus.COMPLETED,
        trigger: AuditTrigger.MANUAL,
        createdAt: new Date('2026-05-08T10:00:00.000Z'),
      };
      const failedRun = {
        id: 'run-2',
        siteId: 'site-2',
        score: null,
        status: AuditStatus.FAILED,
        trigger: AuditTrigger.SCHEDULED,
        createdAt: new Date('2026-05-08T11:00:00.000Z'),
      };

      db.where
        .mockReturnValueOnce(thenable([projectRow]))
        .mockReturnValueOnce(thenable([siteOne, siteTwo]))
        .mockReturnValueOnce(thenable([{ total: 2, active: 1 }]))
        .mockReturnValueOnce(thenable([{ total: 4 }]))
        .mockReturnValueOnce(thenable([completedRun]))
        .mockReturnValueOnce(thenable([failedRun, completedRun]))
        .mockReturnValueOnce(
          thenable([
            {
              createdAt: new Date('2026-05-08T10:00:00.000Z'),
              finishedAt: new Date('2026-05-08T10:02:00.000Z'),
              score: 90,
              siteId: 'site-1',
            },
            {
              createdAt: new Date('2026-05-08T11:00:00.000Z'),
              finishedAt: null,
              score: 88,
              siteId: 'site-2',
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ total: 1 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'comparison-1',
              siteId: 'site-1',
              regressionsCount: 2,
              createdAt: new Date('2026-05-08T12:00:00.000Z'),
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              email: 'invite@example.com',
              createdAt: new Date('2026-05-08T09:00:00.000Z'),
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ auditRunId: 'run-1', total: 3 }]))
        .mockReturnValueOnce(
          thenable([
            { auditRunId: 'run-1', total: 5 },
            { auditRunId: 'run-2', total: 1 },
          ]),
        );

      const out = await service.getDashboard('p1', 'u1');

      expect(out.summary).toStrictEqual({
        activeProjects: 1,
        totalAudits: 4,
        averageScore: 90,
        criticalIssues: 3,
        regressions: 1,
        activeAutomations: 1,
      });
      expect(out.trend).toStrictEqual([
        {
          date: '2026-05-08T10:02:00.000Z',
          score: 90,
          siteDomain: 'one.test',
          siteId: 'site-1',
          siteName: 'One',
        },
        {
          date: '2026-05-08T11:00:00.000Z',
          score: 88,
          siteDomain: 'two.test',
          siteId: 'site-2',
          siteName: 'Two',
        },
      ]);
      expect(out.recentProjects).toStrictEqual([
        expect.objectContaining({ id: 'site-1', latestScore: 90 }),
        expect.objectContaining({ id: 'site-2', latestScore: null }),
      ]);
      expect(out.recentAudits).toStrictEqual([
        expect.objectContaining({
          id: 'run-2',
          issuesCount: 1,
          projectName: 'Two',
        }),
        expect.objectContaining({
          id: 'run-1',
          issuesCount: 5,
          projectName: 'One',
        }),
      ]);
      expect(out.activity).toStrictEqual([
        expect.objectContaining({ kind: 'REGRESSION', title: 'Regresión detectada' }),
        expect.objectContaining({ kind: 'AUDIT_FAILED', title: 'Auditoría fallida' }),
        expect.objectContaining({ kind: 'AUDIT', title: 'Auditoría actualizada' }),
        expect.objectContaining({ kind: 'INVITE', title: 'Nuevo usuario invitado' }),
      ]);
    });
  });

  describe('listMembers', () => {
    it('returns members with computed effective permissions', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]))
        .mockReturnValueOnce(
          thenable([
            {
              userId: 'u-member',
              role: Role.MEMBER,
              extraPermissions: [Permission.EXPORT_CREATE],
              revokedPermissions: [Permission.AUDIT_RUN],
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              email: 'member@example.com',
              name: 'Member',
            },
          ]),
        );

      const out = await service.listMembers('p1', 'u-owner');

      expect(out).toStrictEqual([
        expect.objectContaining({
          email: 'member@example.com',
          effectivePermissions: expect.arrayContaining([Permission.EXPORT_CREATE]),
          extraPermissions: [Permission.EXPORT_CREATE],
          revokedPermissions: [Permission.AUDIT_RUN],
          role: Role.MEMBER,
        }),
      ]);
      expect(out[0]?.effectivePermissions).not.toContain(Permission.AUDIT_RUN);
    });
  });

  describe('assertMember / assertOwner', () => {
    it('assertMember throws when there is no membership row', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.assertMember('p1', 'u-stranger')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('assertMember returns the membership when present', async () => {
      db.where.mockReturnValueOnce(
        thenable([{ projectId: 'p1', userId: 'u1', role: Role.MEMBER }]),
      );

      const out = await service.assertMember('p1', 'u1');
      expect(out.role).toBe(Role.MEMBER);
    });

    it('assertOwner throws when the user is a non-owner member', async () => {
      db.where.mockReturnValueOnce(
        thenable([{ projectId: 'p1', userId: 'u1', role: Role.MEMBER }]),
      );

      await expect(service.assertOwner('p1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('assertOwner returns the membership for OWNER role', async () => {
      db.where.mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]));

      const out = await service.assertOwner('p1', 'u1');
      expect(out.role).toBe(Role.OWNER);
    });
  });

  describe('removeMember', () => {
    it('rejects when the actor is not OWNER', async () => {
      db.where.mockReturnValueOnce(
        thenable([{ projectId: 'p1', userId: 'u1', role: Role.MEMBER }]),
      );

      await expect(service.removeMember('p1', 'u-other', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects when an OWNER tries to remove themselves', async () => {
      db.where.mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]));

      await expect(service.removeMember('p1', 'u1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects when the target member does not exist', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        .mockReturnValueOnce(thenable([]));

      await expect(service.removeMember('p1', 'u-other', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('rejects when the target member is the OWNER', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]));

      await expect(service.removeMember('p1', 'u-owner', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('deletes the membership when actor is OWNER and target is a different user', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-other', role: Role.MEMBER }]))
        // delete().where() resolves to undefined (terminal)
        .mockResolvedValueOnce(undefined);

      const out = await service.removeMember('p1', 'u-other', 'u1');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(out).toStrictEqual({ success: true });
    });
  });

  describe('addMember', () => {
    it('inserts onConflictDoNothing then returns the resulting membership', async () => {
      // 1) insert.values.onConflictDoNothing — already mocked to resolve
      // 2) getMembership: select.from.where.limit().then(rows => rows[0])
      db.where.mockReturnValueOnce(
        thenable([{ projectId: 'p1', userId: 'u1', role: Role.MEMBER }]),
      );

      const out = await service.addMember('p1', 'u1', Role.MEMBER);

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1);
      expect(out?.role).toBe(Role.MEMBER);
    });

    it('rejects OWNER memberships and invalid permission overrides', async () => {
      await expect(service.addMember('p1', 'u1', Role.OWNER)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await expect(
        service.addMember('p1', 'u1', Role.VIEWER, [Permission.PROJECT_DELETE]),
      ).rejects.toThrow('owner-exclusive');
    });
  });

  describe('updateMemberPermissions', () => {
    it('updates role and resets overrides on role changes', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]))
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-member', role: Role.VIEWER }]))
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(
          thenable([{ projectId: 'p1', userId: 'u-member', role: Role.MEMBER }]),
        );

      const out = await service.updateMemberPermissions('p1', 'u-member', 'u-owner', {
        extraPermissions: [Permission.EXPORT_CREATE],
        revokedPermissions: [Permission.SITE_READ],
        role: Role.MEMBER,
      });

      expect(db.set).toHaveBeenCalledWith({
        extraPermissions: [],
        revokedPermissions: [],
        role: Role.MEMBER,
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resourceId: 'u-member',
          metadata: expect.objectContaining({ roleChanged: true }),
        }),
      );
      expect(out?.role).toBe(Role.MEMBER);
    });

    it('rejects attempts to modify or promote owners', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]))
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-target', role: Role.OWNER }]));

      await expect(
        service.updateMemberPermissions('p1', 'u-target', 'u-owner', {
          role: Role.MEMBER,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]))
        .mockReturnValueOnce(
          thenable([{ projectId: 'p1', userId: 'u-target', role: Role.MEMBER }]),
        );

      await expect(
        service.updateMemberPermissions('p1', 'u-target', 'u-owner', {
          role: Role.OWNER,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects revoked permissions that are not part of the role defaults', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u-owner', role: Role.OWNER }]))
        .mockReturnValueOnce(
          thenable([{ projectId: 'p1', userId: 'u-target', role: Role.VIEWER }]),
        );

      await expect(
        service.updateMemberPermissions('p1', 'u-target', 'u-owner', {
          revokedPermissions: [Permission.AUDIT_RUN],
        }),
      ).rejects.toThrow('cannot revoke');
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
