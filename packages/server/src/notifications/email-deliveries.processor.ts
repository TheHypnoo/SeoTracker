import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import type { Env } from '../config/env.schema';
import { MetricsService } from '../metrics/metrics.service';
import { JobFailuresService } from '../queue/job-failures.service';
import { EMAIL_DELIVERIES_QUEUE_NAME } from '../queue/queue.constants';
import type { EmailDeliveryJobData } from '../queue/queue.types';
import { NotificationsService } from './notifications.service';

@Injectable()
export class EmailDeliveriesProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailDeliveriesProcessor.name);
  private closePromise: Promise<void> | null = null;
  private worker: Worker<EmailDeliveryJobData> | null = null;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService<Env, true>,
    private readonly jobFailuresService: JobFailuresService,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<EmailDeliveryJobData>(
      EMAIL_DELIVERIES_QUEUE_NAME,
      async (job) => {
        const startedAt = Date.now();
        this.metricsService.bullmqJobsTotal.inc({
          event: 'started',
          queue: EMAIL_DELIVERIES_QUEUE_NAME,
        });
        try {
          await this.notificationsService.processEmailDelivery(job.data.deliveryId);
          this.metricsService.bullmqJobsTotal.inc({
            event: 'completed',
            queue: EMAIL_DELIVERIES_QUEUE_NAME,
          });
          this.metricsService.bullmqJobDurationSeconds.observe(
            { queue: EMAIL_DELIVERIES_QUEUE_NAME, status: 'completed' },
            (Date.now() - startedAt) / 1000,
          );
        } catch (error) {
          this.metricsService.bullmqJobsTotal.inc({
            event: 'failed',
            queue: EMAIL_DELIVERIES_QUEUE_NAME,
          });
          this.metricsService.bullmqJobDurationSeconds.observe(
            { queue: EMAIL_DELIVERIES_QUEUE_NAME, status: 'failed' },
            (Date.now() - startedAt) / 1000,
          );
          throw error;
        }
      },
      {
        concurrency: this.configService.get('EMAIL_CONCURRENCY', { infer: true }),
        connection: {
          url: this.configService.get('REDIS_URL', { infer: true }),
        },
      },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) {
        return;
      }
      const attemptsMade = job.attemptsMade ?? 0;
      const maxAttempts = job.opts?.attempts ?? 1;
      if (attemptsMade < maxAttempts) {
        return;
      }

      void this.jobFailuresService.record({
        attempts: attemptsMade,
        jobId: job.id,
        jobName: job.name,
        payload: (job.data ?? {}) as unknown as Record<string, unknown>,
        queueName: EMAIL_DELIVERIES_QUEUE_NAME,
        reason: error?.message ?? 'Unknown error',
        stack: error?.stack ?? null,
      });
    });
  }

  async onModuleDestroy() {
    if (!this.worker) {
      if (this.closePromise) {
        await this.closePromise;
      }
      return;
    }
    const worker = this.worker;
    this.worker = null;
    this.closePromise = (async () => {
      this.logger.log(`Draining ${EMAIL_DELIVERIES_QUEUE_NAME} worker before shutdown...`);
      const start = Date.now();
      try {
        await worker.close();
        this.logger.log(`${EMAIL_DELIVERIES_QUEUE_NAME} worker closed in ${Date.now() - start}ms`);
      } catch (error) {
        this.logger.error(
          `Failed to close ${EMAIL_DELIVERIES_QUEUE_NAME} worker after ${Date.now() - start}ms`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    })();
    await this.closePromise;
  }
}
