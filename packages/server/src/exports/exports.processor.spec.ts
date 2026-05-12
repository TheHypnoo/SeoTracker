import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Worker } from 'bullmq';

import { EXPORT_QUEUE_NAME } from '../queue/queue.constants';
import { ExportsProcessor } from './exports.processor';

type WorkerInstance = {
  close: jest.Mock;
  handlers: Record<string, (job: Record<string, unknown> | null, error: Error) => void>;
  processor: (job: { data: { exportId: string } }) => Promise<void>;
};

const mockWorkerInstances: WorkerInstance[] = [];

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, processor, _options) => {
    const instance = {
      close: jest.fn().mockResolvedValue(undefined),
      handlers: {},
      processor,
    } as WorkerInstance & { on: jest.Mock };
    instance.on = jest.fn((event: string, handler) => {
      instance.handlers[event] = handler;
      return instance;
    });
    mockWorkerInstances.push(instance);
    return instance;
  }),
}));

describe('ExportsProcessor', () => {
  const exportsService = { processQueuedExport: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        EXPORT_CONCURRENCY: 2,
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerInstances.length = 0;
  });

  it('creates an export worker and processes successful jobs', async () => {
    const processor = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );

    processor.onModuleInit();

    expect(Worker).toHaveBeenCalledWith(
      EXPORT_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 2,
        connection: { url: 'redis://localhost:6379' },
      }),
    );

    await mockWorkerInstances[0].processor({ data: { exportId: 'export-1' } });

    expect(exportsService.processQueuedExport).toHaveBeenCalledWith('export-1');
    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'completed',
      queue: EXPORT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: EXPORT_QUEUE_NAME, status: 'completed' },
      expect.any(Number),
    );
  });

  it('records failed metrics and rethrows processing errors', async () => {
    exportsService.processQueuedExport.mockRejectedValueOnce(new Error('boom'));
    const processor = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();

    await expect(
      mockWorkerInstances[0].processor({ data: { exportId: 'export-1' } }),
    ).rejects.toThrow('boom');

    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'failed',
      queue: EXPORT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: EXPORT_QUEUE_NAME, status: 'failed' },
      expect.any(Number),
    );
  });

  it('records terminal BullMQ failures and closes the worker on shutdown', async () => {
    const processor = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    const error = new Error('terminal');

    worker.handlers.failed(
      {
        attemptsMade: 2,
        data: { exportId: 'export-1' },
        id: 'job-1',
        name: 'build-export',
        opts: { attempts: 2 },
      },
      error,
    );

    expect(jobFailuresService.record).toHaveBeenCalledWith({
      attempts: 2,
      jobId: 'job-1',
      jobName: 'build-export',
      payload: { exportId: 'export-1' },
      queueName: EXPORT_QUEUE_NAME,
      reason: 'terminal',
      stack: error.stack,
    });

    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('ignores failed events without a job or before terminal attempts', () => {
    const processor = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];

    worker.handlers.failed(null, new Error('missing job'));
    worker.handlers.failed(
      {
        attemptsMade: 1,
        data: { exportId: 'export-1' },
        id: 'job-1',
        name: 'build-export',
        opts: { attempts: 3 },
      },
      new Error('retryable'),
    );

    expect(jobFailuresService.record).not.toHaveBeenCalled();
  });

  it('handles shutdown before initialization and close failures', async () => {
    const notStarted = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    await expect(notStarted.onModuleDestroy()).resolves.toBeUndefined();

    const processor = new ExportsProcessor(
      exportsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    worker.close.mockRejectedValueOnce(new Error('close failed'));

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
