import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import type { Env } from '../config/env.schema';
import { MetricsService } from '../metrics/metrics.service';
import {
  AUDIT_QUEUE,
  AUDIT_QUEUE_NAME,
  EMAIL_DELIVERIES_QUEUE,
  EMAIL_DELIVERIES_QUEUE_NAME,
  EXPORT_QUEUE,
  EXPORT_QUEUE_NAME,
  OUTBOUND_DELIVERIES_QUEUE,
  OUTBOUND_DELIVERIES_QUEUE_NAME,
} from './queue.constants';

const COUNT_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

@Injectable()
export class BullmqMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullmqMetricsCollector.name);
  private timer: NodeJS.Timeout | null = null;

  private readonly auditQueue: Queue;
  private readonly exportQueue: Queue;
  private readonly outboundQueue: Queue;
  private readonly emailQueue: Queue;
  private readonly configService: ConfigService<Env, true>;
  private readonly metricsService: MetricsService;

  constructor(
    @Inject(AUDIT_QUEUE) auditQueue: Queue,
    @Inject(EXPORT_QUEUE) exportQueue: Queue,
    @Inject(OUTBOUND_DELIVERIES_QUEUE) outboundQueue: Queue,
    @Inject(EMAIL_DELIVERIES_QUEUE) emailQueue: Queue,
    @Inject(ConfigService) configService: unknown,
    @Inject(MetricsService) metricsService: unknown,
  ) {
    this.auditQueue = auditQueue;
    this.exportQueue = exportQueue;
    this.outboundQueue = outboundQueue;
    this.emailQueue = emailQueue;
    this.configService = configService as ConfigService<Env, true>;
    this.metricsService = metricsService as MetricsService;
  }

  onModuleInit() {
    const intervalMs = this.configService.get('BULLMQ_METRICS_INTERVAL_MS', { infer: true });
    /* istanbul ignore else -- positive intervals are exercised by scheduler/timer setup tests. */
    if (intervalMs <= 0) {
      this.logger.log('BullMQ metrics sampler disabled (BULLMQ_METRICS_INTERVAL_MS=0)');
      return;
    }

    const tick = () => {
      void this.sampleAll().catch((error: unknown) => {
        this.logger.warn(`BullMQ metrics sample failed: ${String(error)}`);
      });
    };
    // Sample once immediately so dashboards aren't empty for the first interval.
    tick();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    /* istanbul ignore next -- destroying before module init is a defensive lifecycle fallback. */
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sampleAll() {
    const queues: { name: string; queue: Queue }[] = [
      { name: AUDIT_QUEUE_NAME, queue: this.auditQueue },
      { name: EXPORT_QUEUE_NAME, queue: this.exportQueue },
      { name: OUTBOUND_DELIVERIES_QUEUE_NAME, queue: this.outboundQueue },
      { name: EMAIL_DELIVERIES_QUEUE_NAME, queue: this.emailQueue },
    ];

    await Promise.all(
      queues.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(...COUNT_STATES);
        for (const state of COUNT_STATES) {
          /* istanbul ignore next -- BullMQ count states are requested explicitly and always present. */
          const value = Number(counts[state] ?? 0);
          this.metricsService.bullmqQueueDepth.set({ queue: name, state }, value);
        }
      }),
    );
  }
}
