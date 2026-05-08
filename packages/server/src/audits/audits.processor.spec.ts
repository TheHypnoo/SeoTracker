import { Worker } from 'bullmq';

import { AUDIT_QUEUE_NAME } from '../queue/queue.constants';
import { AuditsProcessor } from './audits.processor';

type WorkerInstance = {
  close: jest.Mock;
  handlers: Record<string, (job: Record<string, unknown> | null, error: Error) => void>;
  name: string;
  options: Record<string, unknown>;
  processor: (job: { data: { auditRunId: string } }) => Promise<void>;
};

const mockWorkerInstances: WorkerInstance[] = [];

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((name, processor, options) => {
    const instance: WorkerInstance = {
      close: jest.fn().mockResolvedValue(undefined),
      handlers: {},
      name,
      options,
      processor,
    };
    (instance as unknown as { on: jest.Mock }).on = jest.fn((event: string, handler) => {
      instance.handlers[event] = handler;
      return instance;
    });
    mockWorkerInstances.push(instance);
    return instance;
  }),
}));

describe('AuditsProcessor', () => {
  const auditsService = { processQueuedRun: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        AUDIT_CONCURRENCY_GLOBAL: 4,
        AUDIT_CONCURRENCY_PER_PROJECT: 1,
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

  it('creates an audit worker with configured concurrency and processes successful jobs', async () => {
    const processor = new AuditsProcessor(
      auditsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );

    processor.onModuleInit();
    const worker = mockWorkerInstances[0];

    expect(Worker).toHaveBeenCalledWith(
      AUDIT_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 4,
        connection: { url: 'redis://localhost:6379' },
      }),
    );

    await worker.processor({ data: { auditRunId: 'run-1' } });

    expect(auditsService.processQueuedRun).toHaveBeenCalledWith('run-1', 1);
    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'started',
      queue: AUDIT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'completed',
      queue: AUDIT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: AUDIT_QUEUE_NAME, status: 'completed' },
      expect.any(Number),
    );
  });

  it('records failed metrics and rethrows processing errors', async () => {
    auditsService.processQueuedRun.mockRejectedValueOnce(new Error('boom'));
    const processor = new AuditsProcessor(
      auditsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();

    await expect(
      mockWorkerInstances[0].processor({ data: { auditRunId: 'run-1' } }),
    ).rejects.toThrow('boom');

    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'failed',
      queue: AUDIT_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: AUDIT_QUEUE_NAME, status: 'failed' },
      expect.any(Number),
    );
  });

  it('records terminal BullMQ failures and closes the worker on shutdown', async () => {
    const processor = new AuditsProcessor(
      auditsService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    const error = new Error('terminal');

    worker.handlers.failed(
      {
        attemptsMade: 3,
        data: { auditRunId: 'run-1' },
        id: 'job-1',
        name: 'run-audit',
        opts: { attempts: 3 },
      },
      error,
    );

    expect(jobFailuresService.record).toHaveBeenCalledWith({
      attempts: 3,
      jobId: 'job-1',
      jobName: 'run-audit',
      payload: { auditRunId: 'run-1' },
      queueName: AUDIT_QUEUE_NAME,
      reason: 'terminal',
      stack: error.stack,
    });

    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
