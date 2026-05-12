import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditStatus, AuditTrigger, ScheduleFrequency } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from '../projects/projects.service';
import { SitesService } from './sites.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(rows),
    groupBy: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
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
  onConflictDoUpdate: jest.Mock;
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
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
}

describe('SitesService', () => {
  let service: SitesService;
  let db: DbMock;
  let projects: { assertMember: jest.Mock; assertPermission: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    projects = {
      assertMember: jest.fn().mockResolvedValue({}),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: DRIZZLE, useValue: db },
        { provide: ProjectsService, useValue: projects },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(SitesService);
  });

  describe('create', () => {
    it('asserts membership, normalizes domain and seeds an alertRule row', async () => {
      db.returning.mockResolvedValueOnce([
        { id: 'site-1', projectId: 'p1', name: 'Acme', domain: 'acme.test' },
      ]);

      const out = await service.create('u1', {
        projectId: 'p1',
        name: '  Acme  ',
        domain: 'https://Acme.Test/foo',
        timezone: 'UTC',
      });

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u1', expect.any(String));
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          name: 'Acme',
          normalizedDomain: 'acme.test',
          active: true, // default
        }),
      );
      // Two inserts: sites + alertRules.
      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(out.id).toBe('site-1');
    });

    it('honors `active=false` from input', async () => {
      db.returning.mockResolvedValueOnce([{ id: 's1' }]);

      await service.create('u1', {
        projectId: 'p1',
        name: 'X',
        domain: 'x.test',
        timezone: 'UTC',
        active: false,
      });

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when the site does not exist', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.getById('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('asserts the user is a member of the parent project before returning', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]));

      const out = await service.getById('s1', 'u1');

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u1', expect.any(String));
      expect(out.id).toBe('s1');
    });
  });

  describe('listForProject', () => {
    it('returns an empty page without loading schedules or audit runs when the project has no sites', async () => {
      db.where.mockReturnValueOnce(thenable([{ total: 0 }])).mockReturnValueOnce(thenable([]));

      const out = await service.listForProject('p1', 'u1', {
        pagination: { limit: 25, offset: 0 },
      });

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u1', expect.any(String));
      expect(db.selectDistinctOn).not.toHaveBeenCalled();
      expect(out).toStrictEqual({ items: [], limit: 25, offset: 0, total: 0 });
    });

    it('enriches project sites with schedule, latest audit and critical issue counts', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      db.where
        .mockReturnValueOnce(thenable([{ total: 2 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'site-1',
              active: true,
              createdAt,
              domain: 'one.test',
              name: 'One',
              normalizedDomain: 'one.test',
              projectId: 'p1',
              timezone: 'UTC',
            },
            {
              id: 'site-2',
              active: true,
              createdAt,
              domain: 'two.test',
              name: 'Two',
              normalizedDomain: 'two.test',
              projectId: 'p1',
              timezone: 'UTC',
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ siteId: 'site-2', enabled: true }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'run-1',
              createdAt,
              score: 88,
              siteId: 'site-1',
              status: AuditStatus.COMPLETED,
              trigger: AuditTrigger.MANUAL,
            },
            {
              id: 'run-2',
              createdAt,
              score: 40,
              siteId: 'site-2',
              status: AuditStatus.FAILED,
              trigger: AuditTrigger.SCHEDULED,
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ auditRunId: 'run-1', total: 3 }]));

      const out = await service.listForProject('p1', 'u1', {
        automation: 'inactive',
        pagination: { limit: 10, offset: 0 },
        status: AuditStatus.COMPLETED,
      });

      expect(out.total).toBe(2);
      expect(out.items).toStrictEqual([
        expect.objectContaining({
          automationEnabled: false,
          criticalIssuesCount: 3,
          id: 'site-1',
          latestAuditId: 'run-1',
          latestAuditStatus: AuditStatus.COMPLETED,
          latestAuditTrigger: AuditTrigger.MANUAL,
          latestScore: 88,
        }),
      ]);
    });

    it('filters active automation sites after enrichment', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ total: 1 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'site-1',
              active: true,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              domain: 'one.test',
              name: 'One',
              normalizedDomain: 'one.test',
              projectId: 'p1',
              timezone: 'UTC',
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ siteId: 'site-1', enabled: true }]))
        .mockReturnValueOnce(thenable([]));

      const out = await service.listForProject('p1', 'u1', {
        automation: 'active',
      });

      expect(out.items).toStrictEqual([
        expect.objectContaining({
          automationEnabled: true,
          criticalIssuesCount: 0,
          latestAuditStatus: null,
        }),
      ]);
    });
  });

  describe('update', () => {
    it('only patches fields that were supplied (partial update)', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }])) // getById
        .mockReturnValueOnce(db as unknown as never); // update().set().where().returning()
      db.returning.mockResolvedValueOnce([{ id: 's1', name: 'New' }]);

      await service.update('s1', 'u1', { name: '  New  ' });

      const setArg = (db.set.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
      expect(setArg).toMatchObject({ name: 'New', updatedAt: expect.any(Date) });
      // Domain / timezone / active should NOT be in the patch when not provided.
      expect(setArg).not.toHaveProperty('domain');
      expect(setArg).not.toHaveProperty('active');
    });
  });

  describe('delete', () => {
    it('asserts access via getById then deletes', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]))
        .mockResolvedValueOnce(undefined); // delete().where()

      const out = await service.delete('s1', 'u1');

      expect(db.delete).toHaveBeenCalled();
      expect(out).toStrictEqual({ success: true });
    });
  });

  describe('upsertSchedule', () => {
    it('rejects WEEKLY without a dayOfWeek', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]));

      await expect(
        service.upsertSchedule('s1', 'u1', {
          frequency: ScheduleFrequency.WEEKLY,
          timeOfDay: '09:00',
          timezone: 'UTC',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists DAILY schedule with default enabled=true', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]));
      db.returning.mockResolvedValueOnce([{ siteId: 's1', frequency: 'DAILY' }]);

      const out = await service.upsertSchedule('s1', 'u1', {
        frequency: ScheduleFrequency.DAILY,
        timeOfDay: '09:00',
        timezone: 'UTC',
      });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ frequency: 'DAILY', enabled: true, dayOfWeek: null }),
      );
      expect(db.onConflictDoUpdate).toHaveBeenCalled();
      expect(out.frequency).toBe('DAILY');
    });
  });

  describe('getSchedule', () => {
    it('returns null when no schedule exists', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }])) // getById
        .mockReturnValueOnce(thenable([])); // schedule lookup

      const out = await service.getSchedule('s1', 'u1');

      expect(out).toBeNull();
    });

    it('returns the schedule row when one exists', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([{ siteId: 's1', frequency: 'DAILY' }]));

      const out = await service.getSchedule('s1', 'u1');

      expect(out?.frequency).toBe('DAILY');
    });
  });
});
