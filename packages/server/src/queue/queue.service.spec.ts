import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { QueueService } from './queue.service';

type QueueMock = {
  add: jest.Mock;
  getJobCounts: jest.Mock;
};

function makeQueue(): QueueMock {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJobCounts: jest
      .fn()
      .mockResolvedValue({ active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 }),
  };
}

function makeConfig(overrides: Partial<Record<keyof Env, number>> = {}) {
  const defaults: Partial<Record<keyof Env, number>> = {
    AUDIT_QUEUE_ATTEMPTS: 3,
    EMAIL_QUEUE_ATTEMPTS: 2,
    EXPORT_QUEUE_ATTEMPTS: 4,
    OUTBOUND_QUEUE_ATTEMPTS: 5,
  };

  return {
    get: jest.fn((key: keyof Env) => overrides[key] ?? defaults[key]),
  } as unknown as ConfigService<Env, true>;
}

function makeService(config = makeConfig()) {
  const auditQueue = makeQueue();
  const exportQueue = makeQueue();
  const outboundQueue = makeQueue();
  const emailQueue = makeQueue();

  const service = new QueueService(
    auditQueue as never,
    exportQueue as never,
    outboundQueue as never,
    emailQueue as never,
    config,
  );

  return { auditQueue, config, emailQueue, exportQueue, outboundQueue, service };
}

describe('QueueService', () => {
  describe('enqueueAuditRun', () => {
    it('enqueues audit jobs with configured attempts and auditRunId as the default jobId', async () => {
      const { auditQueue, config, service } = makeService(makeConfig({ AUDIT_QUEUE_ATTEMPTS: 7 }));

      await service.enqueueAuditRun({ auditRunId: 'run-1' });

      expect(config.get).toHaveBeenCalledWith('AUDIT_QUEUE_ATTEMPTS', { infer: true });
      expect(auditQueue.add).toHaveBeenCalledWith(
        'run-audit',
        { auditRunId: 'run-1' },
        expect.objectContaining({
          attempts: 7,
          backoff: { delay: 1_000, type: 'exponential' },
          jobId: 'run-1',
          removeOnComplete: { age: 86_400, count: 200 },
          removeOnFail: { age: 604_800, count: 1000 },
        }),
      );
    });

    it('allows callers to override audit jobId and delay', async () => {
      const { auditQueue, service } = makeService();

      await service.enqueueAuditRun({ auditRunId: 'run-1' }, { delayMs: 1_500, jobId: 'manual-1' });

      expect(auditQueue.add).toHaveBeenCalledWith(
        'run-audit',
        { auditRunId: 'run-1' },
        expect.objectContaining({ delay: 1_500, jobId: 'manual-1' }),
      );
    });
  });

  describe('enqueueExport', () => {
    it('uses exportId as the default jobId and export retry configuration', async () => {
      const { exportQueue, service } = makeService(makeConfig({ EXPORT_QUEUE_ATTEMPTS: 6 }));

      await service.enqueueExport({ exportId: 'export-1' });

      expect(exportQueue.add).toHaveBeenCalledWith(
        'build-export',
        { exportId: 'export-1' },
        expect.objectContaining({
          attempts: 6,
          backoff: { delay: 1_000, type: 'exponential' },
          jobId: 'export-1',
        }),
      );
    });
  });

  describe('enqueueOutboundDelivery', () => {
    it('uses deliveryId as the default jobId and the outbound backoff policy', async () => {
      const { outboundQueue, service } = makeService(makeConfig({ OUTBOUND_QUEUE_ATTEMPTS: 8 }));

      await service.enqueueOutboundDelivery({ deliveryId: 'delivery-1' });

      expect(outboundQueue.add).toHaveBeenCalledWith(
        'deliver-outbound',
        { deliveryId: 'delivery-1' },
        expect.objectContaining({
          attempts: 8,
          backoff: { delay: 2_000, type: 'exponential' },
          jobId: 'delivery-1',
        }),
      );
    });
  });

  describe('enqueueEmailDelivery', () => {
    it('enqueues email jobs with optional delay and cleanup policy', async () => {
      const { emailQueue, service } = makeService(makeConfig({ EMAIL_QUEUE_ATTEMPTS: 9 }));

      await service.enqueueEmailDelivery({ deliveryId: 'email-1' }, { delayMs: 3_000 });

      expect(emailQueue.add).toHaveBeenCalledWith(
        'send-email',
        { deliveryId: 'email-1' },
        expect.objectContaining({
          attempts: 9,
          backoff: { delay: 2_000, type: 'exponential' },
          delay: 3_000,
          jobId: 'email-1',
          removeOnComplete: { age: 86_400, count: 200 },
          removeOnFail: { age: 604_800, count: 1000 },
        }),
      );
    });
  });

  describe('getQueueSummary', () => {
    it('returns counts for every producer queue using stable operational names', async () => {
      const { auditQueue, emailQueue, exportQueue, outboundQueue, service } = makeService();

      const summary = await service.getQueueSummary();

      expect(summary).toStrictEqual([
        {
          counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 },
          name: 'seo-audits',
        },
        {
          counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 },
          name: 'seo-exports',
        },
        {
          counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 },
          name: 'seo-outbound-deliveries',
        },
        {
          counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 },
          name: 'seo-email-deliveries',
        },
      ]);
      expect(auditQueue.getJobCounts).toHaveBeenCalledWith(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      expect(exportQueue.getJobCounts).toHaveBeenCalled();
      expect(outboundQueue.getJobCounts).toHaveBeenCalled();
      expect(emailQueue.getJobCounts).toHaveBeenCalled();
    });
  });
});
