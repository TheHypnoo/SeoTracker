import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Worker } from 'bullmq';

import { GSC_IMPORT_QUEUE_NAME } from '../queue/queue.constants';
import { GscImportProcessor } from './gsc-import.processor';

type WorkerInstance = {
  close: jest.Mock;
  handlers: Record<string, (job: Record<string, unknown> | null, error: Error) => void>;
  on: jest.Mock;
  processor: (job: {
    data: { siteId: string; startDate?: string; endDate?: string; backfill?: boolean };
  }) => Promise<void>;
};

const mockWorkerInstances: WorkerInstance[] = [];

jest.mock<typeof import('bullmq')>('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, processor, _options) => {
    const handlers: WorkerInstance['handlers'] = {};
    const instance: WorkerInstance = {
      close: jest.fn().mockResolvedValue(undefined),
      handlers,
      on: jest.fn((event: string, handler) => {
        handlers[event] = handler;
        return instance;
      }),
      processor,
    };
    mockWorkerInstances.push(instance);
    return instance;
  }) as unknown as typeof import('bullmq').Worker,
}));

describe('gscImportProcessor', () => {
  const searchConsoleService = {
    runScheduledImport: jest.fn(() =>
      Promise.resolve({
        endDate: '2026-06-04',
        importedRows: 12,
        imports: [],
        searchConsolePropertyId: 'property-1',
        siteId: 'site-1',
        startDate: '2026-06-01',
      }),
    ),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        GSC_IMPORT_CONCURRENCY: 2,
        REDIS_URL: 'redis://localhost:6379',
      };
      return values[key];
    }),
  };
  const jobFailuresService = { record: jest.fn() };
  const metricsService = {
    bullmqJobDurationSeconds: { observe: jest.fn() },
    bullmqJobsTotal: { inc: jest.fn() },
  };

  function makeProcessor() {
    return new GscImportProcessor(
      searchConsoleService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerInstances.length = 0;
  });

  it('creates a worker and imports the requested window on success', async () => {
    const processor = makeProcessor();
    processor.onModuleInit();

    expect(Worker).toHaveBeenCalledWith(
      GSC_IMPORT_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 2,
        connection: { url: 'redis://localhost:6379' },
      }),
    );

    await mockWorkerInstances[0].processor({
      data: { siteId: 'site-1', startDate: '2026-06-01', endDate: '2026-06-04', backfill: true },
    });

    expect(searchConsoleService.runScheduledImport).toHaveBeenCalledWith('site-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });
    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'completed',
      queue: GSC_IMPORT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: GSC_IMPORT_QUEUE_NAME, status: 'completed' },
      expect.any(Number),
    );
  });

  it('records failed metrics and rethrows import errors', async () => {
    searchConsoleService.runScheduledImport.mockRejectedValueOnce(new Error('boom') as never);
    const processor = makeProcessor();
    processor.onModuleInit();

    await expect(mockWorkerInstances[0].processor({ data: { siteId: 'site-1' } })).rejects.toThrow(
      'boom',
    );

    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'failed',
      queue: GSC_IMPORT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: GSC_IMPORT_QUEUE_NAME, status: 'failed' },
      expect.any(Number),
    );
  });

  it('records terminal BullMQ failures and closes the worker on shutdown', async () => {
    const processor = makeProcessor();
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    const error = new Error('terminal');

    worker.handlers.failed(
      {
        attemptsMade: 3,
        data: { siteId: 'site-1' },
        id: 'job-1',
        name: 'import-gsc',
        opts: { attempts: 3 },
      },
      error,
    );

    expect(jobFailuresService.record).toHaveBeenCalledWith({
      attempts: 3,
      jobId: 'job-1',
      jobName: 'import-gsc',
      payload: { siteId: 'site-1' },
      queueName: GSC_IMPORT_QUEUE_NAME,
      reason: 'terminal',
      stack: error.stack,
    });

    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('ignores failed events without a job or before terminal attempts', () => {
    const processor = makeProcessor();
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];

    worker.handlers.failed(null, new Error('missing job'));
    worker.handlers.failed(
      {
        attemptsMade: 1,
        data: { siteId: 'site-1' },
        id: 'job-1',
        name: 'import-gsc',
        opts: { attempts: 3 },
      },
      new Error('retryable'),
    );

    expect(jobFailuresService.record).not.toHaveBeenCalled();
  });

  it('records failures with fallback error fields when job data is missing', () => {
    const processor = makeProcessor();
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];

    worker.handlers.failed(
      {
        attemptsMade: 1,
        data: undefined,
        id: undefined,
        name: 'import-gsc',
        opts: undefined,
      },
      undefined as unknown as Error,
    );

    expect(jobFailuresService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 1,
        payload: {},
        reason: 'Unknown error',
        stack: null,
      }),
    );
  });

  it('handles shutdown before initialization and close failures', async () => {
    const notStarted = makeProcessor();
    await expect(notStarted.onModuleDestroy()).resolves.toBeUndefined();

    const closing = Promise.resolve();
    (notStarted as unknown as { closePromise: Promise<void> }).closePromise = closing;
    await expect(notStarted.onModuleDestroy()).resolves.toBeUndefined();

    const processor = makeProcessor();
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    worker.close.mockRejectedValueOnce(new Error('close failed'));

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
