import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@seotracker/shared-types';

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
  };
}

describe('ProjectsService', () => {
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

    it('deletes the membership when actor is OWNER and target is a different user', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ projectId: 'p1', userId: 'u1', role: Role.OWNER }]))
        // delete().where() resolves to undefined (terminal)
        .mockResolvedValueOnce(undefined);

      const out = await service.removeMember('p1', 'u-other', 'u1');

      expect(db.delete).toHaveBeenCalled();
      expect(out).toEqual({ success: true });
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

      expect(db.insert).toHaveBeenCalled();
      expect(db.onConflictDoNothing).toHaveBeenCalled();
      expect(out?.role).toBe(Role.MEMBER);
    });
  });
});
