import { describe, expect, it, jest } from '@jest/globals';
import {
  AuditStatus,
  EmailDeliveryStatus,
  ExportStatus,
  OutboundDeliveryStatus,
} from '@seotracker/shared-types';

import { OperationalStatusService } from './operational-status.service';

type DbMock = {
  execute: jest.Mock;
  select: jest.Mock;
};

function groupRows(rows: Array<{ status: string; total: number | string }>) {
  return {
    from: jest.fn().mockReturnValue({
      groupBy: jest.fn().mockResolvedValue(rows),
    }),
  };
}

function whereRows(rows: Array<{ total: number | string }>) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(rows),
    }),
  };
}

function latestRows(rows: Array<Record<string, unknown>>) {
  return {
    from: jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function makeDb(): DbMock {
  return {
    execute: jest.fn().mockResolvedValue([{ ok: 1 }]),
    select: jest.fn(),
  };
}

function makeService() {
  const db = makeDb();
  const redis = { ping: jest.fn().mockResolvedValue('PONG') };
  const queueService = {
    getQueueSummary: jest.fn().mockResolvedValue([
      {
        counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 0 },
        name: 'seo-audits',
      },
    ]),
  };
  const service = new OperationalStatusService(db as never, redis as never, queueService as never);

  return { db, queueService, redis, service };
}

function mockStatusQueries(
  db: DbMock,
  options: {
    auditRows?: Array<{ status: AuditStatus; total: number | string }>;
    emailRows?: Array<{ status: EmailDeliveryStatus; total: number | string }>;
    exportRows?: Array<{ status: ExportStatus; total: number | string }>;
    failedJobs24h?: number | string;
    latestFailures?: Array<Record<string, unknown>>;
    outboundRows?: Array<{ status: OutboundDeliveryStatus; total: number | string }>;
  } = {},
) {
  db.select
    .mockReturnValueOnce(groupRows(options.auditRows ?? []))
    .mockReturnValueOnce(groupRows(options.exportRows ?? []))
    .mockReturnValueOnce(groupRows(options.outboundRows ?? []))
    .mockReturnValueOnce(groupRows(options.emailRows ?? []))
    .mockReturnValueOnce(whereRows([{ total: options.failedJobs24h ?? 0 }]))
    .mockReturnValueOnce(latestRows(options.latestFailures ?? []));
}

function expectHealthyStatus(
  status: Awaited<ReturnType<OperationalStatusService['getStatus']>>,
  dependencies: Pick<ReturnType<typeof makeService>, 'db' | 'queueService' | 'redis'>,
) {
  expect(status).toMatchObject({
    status: 'ok',
    checks: {
      database: { status: 'ok' },
      redis: { status: 'ok' },
    },
    counts: {
      audits: {
        [AuditStatus.COMPLETED]: 3,
        [AuditStatus.FAILED]: 0,
        [AuditStatus.QUEUED]: 0,
        [AuditStatus.RUNNING]: 0,
      },
      emailDeliveries: {
        [EmailDeliveryStatus.FAILED]: 0,
        [EmailDeliveryStatus.SENT]: 5,
      },
      outboundDeliveries: {
        [OutboundDeliveryStatus.FAILED]: 0,
        [OutboundDeliveryStatus.SUCCESS]: 2,
      },
    },
    failures: { failedJobs24h: 0, latest: [] },
    queues: [
      {
        counts: { active: 0, completed: 1, delayed: 0, failed: 0, waiting: 0 },
        name: 'seo-audits',
      },
    ],
  });
  expect(dependencies.db.execute).toHaveBeenCalledTimes(1);
  expect(dependencies.redis.ping).toHaveBeenCalledTimes(1);
  expect(dependencies.queueService.getQueueSummary).toHaveBeenCalledTimes(1);
}

describe('operationalStatusService', () => {
  it('returns ok status with zero-filled counts when dependencies are healthy', async () => {
    const { db, queueService, redis, service } = makeService();
    mockStatusQueries(db, {
      auditRows: [{ status: AuditStatus.COMPLETED, total: '3' }],
      emailRows: [{ status: EmailDeliveryStatus.SENT, total: 5 }],
      exportRows: [{ status: ExportStatus.PROCESSING, total: 1 }],
      outboundRows: [{ status: OutboundDeliveryStatus.SUCCESS, total: '2' }],
    });

    const status = await service.getStatus();

    expectHealthyStatus(status, { db, queueService, redis });
  });

  it('returns degraded status when health checks or operational failure counters are failing', async () => {
    const { db, redis, service } = makeService();
    db.execute.mockRejectedValueOnce(new Error('db unavailable'));
    redis.ping.mockRejectedValueOnce(new Error('redis unavailable'));
    mockStatusQueries(db, {
      emailRows: [{ status: EmailDeliveryStatus.FAILED, total: 1 }],
      failedJobs24h: '2',
      latestFailures: [
        {
          attempts: 3,
          failedAt: new Date('2026-05-08T10:00:00.000Z'),
          id: 'failure-1',
          jobId: 'job-1',
          jobName: 'run-audit',
          queueName: 'seo-audits',
          reason: 'boom',
        },
      ],
      outboundRows: [{ status: OutboundDeliveryStatus.FAILED, total: '4' }],
    });

    const status = await service.getStatus();

    expect(status).toMatchObject({
      status: 'degraded',
      checks: {
        database: { error: 'db unavailable', status: 'fail' },
        redis: { error: 'redis unavailable', status: 'fail' },
      },
      counts: {
        emailDeliveries: { [EmailDeliveryStatus.FAILED]: 1 },
        outboundDeliveries: { [OutboundDeliveryStatus.FAILED]: 4 },
      },
      failures: {
        failedJobs24h: 2,
        latest: [expect.objectContaining({ id: 'failure-1' })],
      },
    });
  });
});
