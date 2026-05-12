import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BullmqMetricsCollector } from './bullmq-metrics.collector';
import {
  AUDIT_QUEUE_NAME,
  EMAIL_DELIVERIES_QUEUE_NAME,
  EXPORT_QUEUE_NAME,
  OUTBOUND_DELIVERIES_QUEUE_NAME,
} from './queue.constants';

function makeQueue(counts: Record<string, number> = {}) {
  return {
    getJobCounts: jest.fn().mockResolvedValue({
      active: 2,
      completed: 4,
      delayed: 3,
      failed: 1,
      waiting: 5,
      ...counts,
    }),
  };
}

describe('bullmqMetricsCollector', () => {
  const configService = { get: jest.fn() };
  const metricsService = { bullmqQueueDepth: { set: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not start a sampler when the interval is disabled', () => {
    configService.get.mockReturnValueOnce(0);
    const collector = new BullmqMetricsCollector(
      makeQueue() as never,
      makeQueue() as never,
      makeQueue() as never,
      makeQueue() as never,
      configService as never,
      metricsService as never,
    );

    collector.onModuleInit();

    expect(metricsService.bullmqQueueDepth.set).not.toHaveBeenCalled();
  });

  it('samples all queue depths immediately and clears its timer on shutdown', async () => {
    configService.get.mockReturnValueOnce(60_000);
    const auditQueue = makeQueue({ waiting: 9 });
    const exportQueue = makeQueue();
    const outboundQueue = makeQueue();
    const emailQueue = makeQueue();
    const collector = new BullmqMetricsCollector(
      auditQueue as never,
      exportQueue as never,
      outboundQueue as never,
      emailQueue as never,
      configService as never,
      metricsService as never,
    );

    collector.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(auditQueue.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    );
    expect(metricsService.bullmqQueueDepth.set).toHaveBeenCalledWith(
      { queue: AUDIT_QUEUE_NAME, state: 'waiting' },
      9,
    );
    collector.onModuleDestroy();

    expect(metricsService.bullmqQueueDepth.set).toHaveBeenCalledWith(
      { queue: EXPORT_QUEUE_NAME, state: 'completed' },
      4,
    );
    expect(metricsService.bullmqQueueDepth.set).toHaveBeenCalledWith(
      { queue: OUTBOUND_DELIVERIES_QUEUE_NAME, state: 'completed' },
      4,
    );
    expect(metricsService.bullmqQueueDepth.set).toHaveBeenCalledWith(
      { queue: EMAIL_DELIVERIES_QUEUE_NAME, state: 'completed' },
      4,
    );
  });
});
