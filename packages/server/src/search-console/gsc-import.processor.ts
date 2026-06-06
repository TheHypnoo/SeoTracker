import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import type { Env } from '../config/env.schema';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobFailuresService } from '../queue/job-failures.service';
import { GSC_IMPORT_QUEUE_NAME } from '../queue/queue.constants';
import type { GscImportJobData } from '../queue/queue.types';
import { SearchConsoleService } from './search-console.service';

@Injectable()
export class GscImportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GscImportProcessor.name);
  private closePromise: Promise<void> | null = null;
  private worker: Worker<GscImportJobData> | null = null;

  constructor(
    private readonly searchConsoleService: SearchConsoleService,
    private readonly configService: ConfigService<Env, true>,
    private readonly jobFailuresService: JobFailuresService,
    private readonly metricsService: MetricsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<GscImportJobData>(
      GSC_IMPORT_QUEUE_NAME,
      async (job) => {
        const startedAt = Date.now();
        this.metricsService.bullmqJobsTotal.inc({
          event: 'started',
          queue: GSC_IMPORT_QUEUE_NAME,
        });
        try {
          const result = await this.searchConsoleService.runScheduledImport(job.data.siteId, {
            endDate: job.data.endDate,
            startDate: job.data.startDate,
          });
          this.logger.log(
            `Imported ${result.importedRows} GSC rows for site ${job.data.siteId} ` +
              `(${result.startDate}..${result.endDate}${job.data.backfill ? ', backfill' : ''})`,
          );
          await this.notifyOnClicksDrop(job.data.siteId);
          this.metricsService.bullmqJobsTotal.inc({
            event: 'completed',
            queue: GSC_IMPORT_QUEUE_NAME,
          });
          this.metricsService.bullmqJobDurationSeconds.observe(
            { queue: GSC_IMPORT_QUEUE_NAME, status: 'completed' },
            (Date.now() - startedAt) / 1000,
          );
        } catch (error) {
          this.metricsService.bullmqJobsTotal.inc({
            event: 'failed',
            queue: GSC_IMPORT_QUEUE_NAME,
          });
          this.metricsService.bullmqJobDurationSeconds.observe(
            { queue: GSC_IMPORT_QUEUE_NAME, status: 'failed' },
            (Date.now() - startedAt) / 1000,
          );
          throw error;
        }
      },
      {
        concurrency: this.configService.get('GSC_IMPORT_CONCURRENCY', { infer: true }),
        connection: {
          url: this.configService.get('REDIS_URL', { infer: true }),
        },
      },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) {
        return;
      }
      /* istanbul ignore next -- BullMQ failed jobs always expose attemptsMade. */
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
        queueName: GSC_IMPORT_QUEUE_NAME,
        reason: error?.message ?? 'Unknown error',
        stack: error?.stack ?? null,
      });
    });
  }

  /**
   * Best-effort week-over-week clicks-drop alert. Runs after a successful import; a failure here
   * is logged but never fails the job (the data is already persisted).
   */
  private async notifyOnClicksDrop(siteId: string) {
    try {
      const alert = await this.searchConsoleService.getClicksDropAlert(siteId);
      if (!alert) {
        return;
      }
      const dropPercent = Math.round(alert.dropRatio * 100);
      await this.notificationsService.createForProjectMembers(alert.projectId, {
        body: `Los clics orgánicos han caído un ${dropPercent}% esta semana (${alert.previousClicks} → ${alert.recentClicks}). Revisa Search Console.`,
        title: 'Caída de clics en Search Console',
        type: 'gsc.clicks_drop',
      });
    } catch (error) {
      this.logger.warn(`Clicks-drop alert failed for site ${siteId}: ${String(error)}`);
    }
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
      this.logger.log(`Draining ${GSC_IMPORT_QUEUE_NAME} worker before shutdown...`);
      const start = Date.now();
      try {
        await worker.close();
        this.logger.log(`${GSC_IMPORT_QUEUE_NAME} worker closed in ${Date.now() - start}ms`);
      } catch (error) {
        this.logger.error(
          `Failed to close ${GSC_IMPORT_QUEUE_NAME} worker after ${Date.now() - start}ms`,
          /* istanbul ignore next -- worker close failures are emitted as Error instances by BullMQ. */
          error instanceof Error ? error.stack : String(error),
        );
      }
    })();
    await this.closePromise;
  }
}
