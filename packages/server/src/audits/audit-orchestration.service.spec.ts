import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditStatus, AuditTrigger } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { QueueService } from '../queue/queue.service';
import { SitesService } from '../sites/sites.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuditOrchestrationService } from './audit-orchestration.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

describe('auditOrchestrationService', () => {
  let service: AuditOrchestrationService;
  let db: DbMock;
  let queue: { enqueueAuditRun: jest.Mock };
  let sites: { getById: jest.Mock; getByIdWithPermission: jest.Mock };
  let systemLogs: { error: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    queue = { enqueueAuditRun: jest.fn().mockResolvedValue(undefined) };
    sites = {
      getById: jest.fn().mockResolvedValue({ id: 's1', projectId: 'p1' }),
      getByIdWithPermission: jest.fn().mockResolvedValue({ id: 's1', projectId: 'p1' }),
    };
    systemLogs = { error: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditOrchestrationService,
        { provide: DRIZZLE, useValue: db },
        { provide: QueueService, useValue: queue },
        { provide: SitesService, useValue: sites },
        { provide: SystemLogsService, useValue: systemLogs },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuditOrchestrationService);
  });

  describe('runManual', () => {
    it('asserts site access, inserts audit run + RUN_QUEUED event, enqueues job', async () => {
      db.returning.mockResolvedValueOnce([{ id: 'run-1', siteId: 's1' }]);

      const out = await service.runManual('s1', 'u1');

      expect(sites.getByIdWithPermission).toHaveBeenCalledWith('s1', 'u1', expect.any(String));
      // Two inserts: audit_runs + audit_events
      expect(db.insert).toHaveBeenCalledTimes(2);
      const runValues = db.values.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(runValues).toMatchObject({
        siteId: 's1',
        trigger: AuditTrigger.MANUAL,
        status: AuditStatus.QUEUED,
      });
      expect(queue.enqueueAuditRun).toHaveBeenCalledWith({
        auditRunId: 'run-1',
        siteId: 's1',
      });
      expect(out.id).toBe('run-1');
    });
  });

  describe('runScheduled', () => {
    it('throws NotFoundException when site does not exist', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.runScheduled('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.enqueueAuditRun).not.toHaveBeenCalled();
    });

    it('creates a SCHEDULED run and enqueues it', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 's1' }]));
      db.returning.mockResolvedValueOnce([{ id: 'run-2', siteId: 's1' }]);

      const out = await service.runScheduled('s1');

      const runValues = db.values.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(runValues.trigger).toBe(AuditTrigger.SCHEDULED);
      expect(out.id).toBe('run-2');
    });
  });

  describe('runWebhook', () => {
    it('throws NotFoundException when the webhook site does not exist', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.runWebhook('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.enqueueAuditRun).not.toHaveBeenCalled();
    });

    it('creates a WEBHOOK run and enqueues it', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 's1' }]));
      db.returning.mockResolvedValueOnce([{ id: 'run-3' }]);

      await service.runWebhook('s1');

      const runValues = db.values.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(runValues.trigger).toBe(AuditTrigger.WEBHOOK);
    });
  });

  describe('markRunFailed', () => {
    it('updates the run to FAILED, inserts RUN_FAILED event, logs to system_logs', async () => {
      // update.set.where(...) is the first chain; default db.where = jest.fn()
      // returns undefined which resolves fine.
      const err = new Error('boom');

      await service.markRunFailed('run-x', 'analysis crashed', err);

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AuditStatus.FAILED,
          finishedAt: expect.any(Date),
        }),
      );
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          auditRunId: 'run-x',
          eventType: 'RUN_FAILED',
          payload: { reason: 'analysis crashed' },
        }),
      );
      expect(systemLogs.error).toHaveBeenCalledWith(
        'AuditOrchestrationService',
        'analysis crashed',
        err,
        expect.objectContaining({ auditRunId: 'run-x' }),
        'run-x',
      );
    });
  });

  describe('reconcileQueuedRuns', () => {
    it('re-enqueues stale queued runs with unique reconcile job ids', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          { id: 'run-1', siteId: 'site-1' },
          { id: 'run-2', siteId: 'site-2' },
        ]),
      );

      await expect(
        service.reconcileQueuedRuns({ limit: 2, staleAfterMs: 1_000 }),
      ).resolves.toStrictEqual({
        checked: 2,
        requeued: 2,
      });
      expect(queue.enqueueAuditRun).toHaveBeenCalledWith(
        { auditRunId: 'run-1', siteId: 'site-1' },
        expect.objectContaining({ jobId: expect.stringContaining('run-1:reconcile:') }),
      );
      expect(queue.enqueueAuditRun).toHaveBeenCalledWith(
        { auditRunId: 'run-2', siteId: 'site-2' },
        expect.objectContaining({ jobId: expect.stringContaining('run-2:reconcile:') }),
      );
    });

    it('logs per-run reconcile failures and keeps processing remaining candidates', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          { id: 'run-1', siteId: 'site-1' },
          { id: 'run-2', siteId: 'site-2' },
        ]),
      );
      queue.enqueueAuditRun
        .mockRejectedValueOnce(new Error('queue down'))
        .mockResolvedValueOnce(undefined);

      await expect(service.reconcileQueuedRuns({ limit: 2 })).resolves.toStrictEqual({
        checked: 2,
        requeued: 1,
      });
      expect(systemLogs.error).toHaveBeenCalledWith(
        AuditOrchestrationService.name,
        'Queued audit run could not be reconciled',
        expect.any(Error),
        { auditRunId: 'run-1', siteId: 'site-1' },
        'run-1',
      );
    });
  });
});
