import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Worker } from 'bullmq';

import { OUTBOUND_DELIVERIES_QUEUE_NAME } from '../queue/queue.constants';
import { OutboundWebhooksProcessor } from './outbound-webhooks.processor';

type WorkerInstance = {
  close: jest.Mock;
  handlers: Record<string, (job: Record<string, unknown> | null, error: Error) => void>;
  on: jest.Mock;
  processor: (job: { data: { deliveryId: string } }) => Promise<void>;
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

describe('outboundWebhooksProcessor', () => {
  const outboundWebhooksService = { processDelivery: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        OUTBOUND_CONCURRENCY: 5,
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

  it('creates an outbound worker and processes successful jobs', async () => {
    const processor = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );

    processor.onModuleInit();

    expect(Worker).toHaveBeenCalledWith(
      OUTBOUND_DELIVERIES_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 5,
        connection: { url: 'redis://localhost:6379' },
      }),
    );

    await mockWorkerInstances[0].processor({ data: { deliveryId: 'delivery-1' } });

    expect(outboundWebhooksService.processDelivery).toHaveBeenCalledWith('delivery-1');
    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'completed',
      queue: OUTBOUND_DELIVERIES_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: OUTBOUND_DELIVERIES_QUEUE_NAME, status: 'completed' },
      expect.any(Number),
    );
  });

  it('records failed metrics and rethrows processing errors', async () => {
    outboundWebhooksService.processDelivery.mockRejectedValueOnce(new Error('boom'));
    const processor = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();

    await expect(
      mockWorkerInstances[0].processor({ data: { deliveryId: 'delivery-1' } }),
    ).rejects.toThrow('boom');

    expect(metricsService.bullmqJobsTotal.inc).toHaveBeenCalledWith({
      event: 'failed',
      queue: OUTBOUND_DELIVERIES_QUEUE_NAME,
    });
    expect(metricsService.bullmqJobDurationSeconds.observe).toHaveBeenCalledWith(
      { queue: OUTBOUND_DELIVERIES_QUEUE_NAME, status: 'failed' },
      expect.any(Number),
    );
  });

  it('records terminal BullMQ failures and closes the worker on shutdown', async () => {
    const processor = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    processor.onModuleInit();
    const worker = mockWorkerInstances[0];
    const error = new Error('terminal');

    worker.handlers.failed(
      {
        attemptsMade: 5,
        data: { deliveryId: 'delivery-1' },
        id: 'job-1',
        name: 'deliver-outbound',
        opts: { attempts: 5 },
      },
      error,
    );

    expect(jobFailuresService.record).toHaveBeenCalledWith({
      attempts: 5,
      jobId: 'job-1',
      jobName: 'deliver-outbound',
      payload: { deliveryId: 'delivery-1' },
      queueName: OUTBOUND_DELIVERIES_QUEUE_NAME,
      reason: 'terminal',
      stack: error.stack,
    });

    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('ignores failed events without a job or before terminal attempts', () => {
    const processor = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
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
        data: { deliveryId: 'delivery-1' },
        id: 'job-1',
        name: 'deliver-outbound',
        opts: { attempts: 3 },
      },
      new Error('retryable'),
    );

    expect(jobFailuresService.record).not.toHaveBeenCalled();
  });

  it('handles shutdown before initialization and close failures', async () => {
    const notStarted = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
      configService as never,
      jobFailuresService as never,
      metricsService as never,
    );
    await expect(notStarted.onModuleDestroy()).resolves.toBeUndefined();

    const processor = new OutboundWebhooksProcessor(
      outboundWebhooksService as never,
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
