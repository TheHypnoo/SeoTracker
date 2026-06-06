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
    GSC_IMPORT_QUEUE_ATTEMPTS: 3,
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
  const gscImportQueue = makeQueue();

  const service = new QueueService(
    auditQueue as never,
    exportQueue as never,
    outboundQueue as never,
    emailQueue as never,
    gscImportQueue as never,
    config,
  );

  return { auditQueue, config, emailQueue, exportQueue, gscImportQueue, outboundQueue, service };
}

describe('queueService', () => {
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

  describe('enqueueGscImport', () => {
    it('derives a windowed daily jobId from the site and the configured import attempts', async () => {
      const { gscImportQueue, service } = makeService(makeConfig({ GSC_IMPORT_QUEUE_ATTEMPTS: 4 }));

      await service.enqueueGscImport({
        siteId: 'site-1',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
      });

      expect(gscImportQueue.add).toHaveBeenCalledWith(
        'import-gsc',
        expect.objectContaining({ siteId: 'site-1' }),
        expect.objectContaining({
          attempts: 4,
          backoff: { delay: 5_000, type: 'exponential' },
          jobId: 'site-1:daily:2026-06-01:2026-06-04',
        }),
      );
    });

    it('falls back to an auto window when no dates are supplied', async () => {
      const { gscImportQueue, service } = makeService();

      await service.enqueueGscImport({ siteId: 'site-1' });

      expect(gscImportQueue.add).toHaveBeenCalledWith(
        'import-gsc',
        { siteId: 'site-1' },
        expect.objectContaining({ jobId: 'site-1:daily:auto' }),
      );
    });

    it('uses a distinct jobId for backfills so they do not collide with the daily import', async () => {
      const { gscImportQueue, service } = makeService();

      await service.enqueueGscImport({ siteId: 'site-1', backfill: true });

      expect(gscImportQueue.add).toHaveBeenCalledWith(
        'import-gsc',
        { siteId: 'site-1', backfill: true },
        expect.objectContaining({ jobId: 'site-1:backfill:auto' }),
      );
    });

    it('honors explicit jobId and delay overrides', async () => {
      const { gscImportQueue, service } = makeService();

      await service.enqueueGscImport({ siteId: 'site-1' }, { delayMs: 2_000, jobId: 'manual' });

      expect(gscImportQueue.add).toHaveBeenCalledWith(
        'import-gsc',
        { siteId: 'site-1' },
        expect.objectContaining({ delay: 2_000, jobId: 'manual' }),
      );
    });
  });

  describe('getQueueSummary', () => {
    it('returns counts for every producer queue using stable operational names', async () => {
      const { service } = makeService();

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
        {
          counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 2 },
          name: 'seo-gsc-import',
        },
      ]);
    });

    it('queries each producer queue for the standard job-count states', async () => {
      const { auditQueue, emailQueue, exportQueue, gscImportQueue, outboundQueue, service } =
        makeService();
      const args = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

      await service.getQueueSummary();

      expect(auditQueue.getJobCounts).toHaveBeenCalledWith(...args);
      expect(exportQueue.getJobCounts).toHaveBeenCalledWith(...args);
      expect(outboundQueue.getJobCounts).toHaveBeenCalledWith(...args);
      expect(emailQueue.getJobCounts).toHaveBeenCalledWith(...args);
      expect(gscImportQueue.getJobCounts).toHaveBeenCalledWith(...args);
    });
  });
});
