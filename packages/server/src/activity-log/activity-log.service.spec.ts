import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ActivityAction, Role } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { ActivityLogService } from './activity-log.service';

function thenable<T>(rows: T) {
  const node = {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return node;
}

describe('activityLogService', () => {
  let service: ActivityLogService;
  let db: {
    insert: jest.Mock;
    values: jest.Mock;
    select: jest.Mock;
    from: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: DRIZZLE, useValue: db }],
    }).compile();
    service = moduleRef.get(ActivityLogService);
  });

  describe('record', () => {
    it('persists with all required fields', async () => {
      await service.record({
        projectId: 'p1',
        userId: 'u1',
        role: Role.OWNER,
        action: ActivityAction.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: 'p1',
        metadata: { name: 'Acme' },
      });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          userId: 'u1',
          role: Role.OWNER,
          action: ActivityAction.PROJECT_CREATED,
          resourceType: 'project',
          resourceId: 'p1',
          metadata: { name: 'Acme' },
        }),
      );
    });

    it('coerces nullable optional fields to null', async () => {
      await service.record({
        projectId: 'p1',
        userId: null,
        role: null,
        action: ActivityAction.AUDIT_RUN,
      });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          role: null,
          resourceType: null,
          resourceId: null,
          siteId: null,
          metadata: {},
        }),
      );
    });

    it('swallows DB errors so audit writes never break business paths', async () => {
      db.values.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.record({
          projectId: 'p1',
          userId: 'u1',
          role: Role.OWNER,
          action: ActivityAction.PROJECT_CREATED,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('listForProject', () => {
    it('caps limit at 200 even when caller asks for more', async () => {
      // Last call in the chain is .limit(N)
      const limitSpy = jest.fn().mockResolvedValue([]);
      db.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({ limit: limitSpy }),
      });

      await service.listForProject('p1', { pagination: { limit: 9999, offset: 0 } });

      expect(limitSpy).toHaveBeenCalledWith(200);
    });

    it('uses default limit (50) when no pagination supplied', async () => {
      const limitSpy = jest.fn().mockResolvedValue([]);
      db.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({ limit: limitSpy }),
      });
      await service.listForProject('p1');
      expect(limitSpy).toHaveBeenCalledWith(50);
    });
  });

  describe('snapshotRole', () => {
    it('returns null when userId is null', async () => {
      await expect(service.snapshotRole('p1', null)).resolves.toBeNull();
    });

    it('returns null when the user is not a member', async () => {
      db.where.mockReturnValueOnce(thenable([]));
      await expect(service.snapshotRole('p1', 'u-stranger')).resolves.toBeNull();
    });

    it('returns the role when the membership exists', async () => {
      db.where.mockReturnValueOnce(thenable([{ role: Role.MEMBER }]));
      await expect(service.snapshotRole('p1', 'u1')).resolves.toBe(Role.MEMBER);
    });
  });
});
