import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EngineTelemetryService } from './engine-telemetry.service';

function query<T>(rows: T[]) {
  const builder = {
    from: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    orderBy: jest.fn(() => Promise.resolve(rows)),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    where: jest.fn(() => builder),
  };
  return builder;
}

function makeService(db: { select: jest.Mock }) {
  return new EngineTelemetryService(db as never);
}

describe('engineTelemetryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a per-audit timeline with totals in execution order', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ scoringModelVersion: 'v2' }]))
        .mockReturnValueOnce(
          query([
            {
              id: 't1',
              stage: 'homepage_fetch',
              status: 'success',
              durationMs: 120,
              error: null,
              details: { http_status: 200 },
              createdAt: new Date('2026-06-01T10:00:00.000Z'),
            },
            {
              id: 't2',
              stage: 'scoring',
              status: 'error',
              durationMs: 80,
              error: 'boom',
              details: null,
              createdAt: new Date('2026-06-01T10:00:01.000Z'),
            },
          ]),
        ),
    };

    const result = await makeService(db).getRunTimeline('audit-1');

    expect(result).toMatchObject({
      auditId: 'audit-1',
      scoringModelVersion: 'v2',
      totalDurationMs: 200,
      stageCount: 2,
      errorCount: 1,
    });
    expect(result.stages[0]).toMatchObject({ stage: 'homepage_fetch', status: 'success' });
    expect(result.stages[1]?.createdAt).toBe('2026-06-01T10:00:01.000Z');
  });

  it('throws when the audit run does not exist', async () => {
    const db = { select: jest.fn().mockReturnValueOnce(query([])) };
    await expect(makeService(db).getRunTimeline('missing')).rejects.toThrow('Audit not found');
  });

  it('aggregates global engine health sorted by p95 desc', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ runCount: 4, totalSamples: 40 }]))
        .mockReturnValueOnce(
          query([
            {
              stage: 'homepage_fetch',
              sampleCount: 4,
              errorCount: 0,
              errorRate: 0,
              p50DurationMs: 100,
              p95DurationMs: 120,
              avgDurationMs: 105,
              maxDurationMs: 130,
            },
            {
              stage: 'crawl_pages',
              sampleCount: 4,
              errorCount: 1,
              errorRate: 0.25,
              p50DurationMs: 900,
              p95DurationMs: 1500,
              avgDurationMs: 1000,
              maxDurationMs: 1800,
            },
          ]),
        ),
    };

    const health = await makeService(db).getHealth({});
    expect(health.stages[0]?.stage).toBe('crawl_pages');
    expect(health.runCount).toBe(4);
    expect(health.totalSamples).toBe(40);
    expect(health.siteId).toBeNull();
    expect(health.projectId).toBeNull();
  });

  it('returns the engine-health time series mapped to numbers', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        query([
          {
            date: '2026-06-01',
            stage: 'scoring',
            sampleCount: '3',
            errorRate: '0',
            p50DurationMs: '50',
            p95DurationMs: '70',
          },
        ]),
      ),
    };
    const series = await makeService(db).getHealthTimeseries({});
    expect(series).toStrictEqual([
      {
        date: '2026-06-01',
        stage: 'scoring',
        sampleCount: 3,
        errorRate: 0,
        p50DurationMs: 50,
        p95DurationMs: 70,
      },
    ]);
  });

  it('filters the time series by stage when provided', async () => {
    const db = { select: jest.fn().mockReturnValueOnce(query([])) };
    await makeService(db).getHealthTimeseries({ siteId: 'site-1', stage: 'scoring' });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('groups model-version stats', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        query([
          {
            scoringModelVersion: 'v2',
            stage: 'scoring',
            sampleCount: 5,
            errorRate: 0,
            p50DurationMs: 40,
            p95DurationMs: 60,
          },
        ]),
      ),
    };
    const rows = await makeService(db).getModelVersionStats({ projectId: 'project-1' });
    expect(rows[0]).toMatchObject({ scoringModelVersion: 'v2', stage: 'scoring' });
  });
});
