import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduleFrequency } from '@seotracker/shared-types';
import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { AuditsService } from '../audits/audits.service';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { siteSchedules, sites } from '../database/schema';
import { ExportsService } from '../exports/exports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { DistributedLockService } from '../queue/distributed-lock.service';
import { QueueService } from '../queue/queue.service';
import { SearchConsoleService } from '../search-console/search-console.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

interface DueSchedule {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  timeOfDay: string;
  timezone: string;
  lastRunAt: Date | null;
}

export function isScheduleDue(
  schedule: DueSchedule,
  nowUtc: DateTime,
  dueWindowMinutes: number,
): boolean {
  const now = nowUtc.setZone(schedule.timezone);
  const [hour, minute] = schedule.timeOfDay.split(':').map(Number);

  if (hour === undefined || minute === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  const scheduledAt = now.set({ hour, millisecond: 0, minute, second: 0 });
  const minutesSinceScheduled = now.diff(scheduledAt, 'minutes').minutes;

  if (minutesSinceScheduled < 0 || minutesSinceScheduled >= dueWindowMinutes) {
    return false;
  }

  if (schedule.frequency === ScheduleFrequency.WEEKLY) {
    const weekday = scheduledAt.weekday % 7;
    if (schedule.dayOfWeek !== weekday) {
      return false;
    }
  }

  const lastRun = schedule.lastRunAt
    ? DateTime.fromJSDate(schedule.lastRunAt).setZone(schedule.timezone)
    : null;

  return !lastRun || lastRun.toMillis() < scheduledAt.toMillis();
}

// Env marker the worker bootstrap sets before instantiating WorkerModule.
// SchedulingService asserts it in onModuleInit so the @Cron decorators never
// fire twice if SchedulingModule is accidentally imported by apps/api.
export const SEOTRACKER_RUNTIME_ROLE_ENV = 'SEOTRACKER_RUNTIME_ROLE';
export const WORKER_RUNTIME_ROLE = 'worker';

@Injectable()
export class SchedulingService implements OnModuleInit {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly auditsService: AuditsService,
    private readonly distributedLockService: DistributedLockService,
    private readonly systemLogsService: SystemLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly exportsService: ExportsService,
    private readonly outboundWebhooksService: OutboundWebhooksService,
    private readonly searchConsoleService: SearchConsoleService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    const role = process.env[SEOTRACKER_RUNTIME_ROLE_ENV];
    if (role !== WORKER_RUNTIME_ROLE) {
      throw new Error(
        `SchedulingService must only run in the worker process. ` +
          `Detected ${SEOTRACKER_RUNTIME_ROLE_ENV}=${role ?? '<unset>'}; ` +
          `expected "${WORKER_RUNTIME_ROLE}". ` +
          `If you wired SchedulingModule into apps/api by mistake, remove it — ` +
          `loading it there would fire every @Cron decorator twice.`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueSchedules() {
    const lockKey = this.configService.get('SCHEDULER_LOCK_KEY', { infer: true });
    const lockTtlMs = this.configService.get('SCHEDULER_LOCK_TTL_MS', { infer: true });
    const dueWindowMinutes = this.configService.get('SCHEDULER_DUE_WINDOW_MINUTES', {
      infer: true,
    });
    const nowUtc = DateTime.now();

    const executed = await this.distributedLockService.withLock(
      lockKey,
      lockTtlMs,
      async (signal) => {
        const schedules = await this.db
          .select({
            dayOfWeek: siteSchedules.dayOfWeek,
            frequency: siteSchedules.frequency,
            id: siteSchedules.id,
            lastRunAt: siteSchedules.lastRunAt,
            siteId: siteSchedules.siteId,
            timeOfDay: siteSchedules.timeOfDay,
            timezone: siteSchedules.timezone,
          })
          .from(siteSchedules)
          .innerJoin(sites, eq(sites.id, siteSchedules.siteId))
          .where(and(eq(siteSchedules.enabled, true), eq(sites.active, true)));

        for (const schedule of schedules) {
          if (signal.aborted) {
            this.logger.warn(
              `Aborting scheduler tick after ${schedules.indexOf(schedule)} schedules; lock was lost`,
            );
            break;
          }
          if (!isScheduleDue(schedule, nowUtc, dueWindowMinutes)) {
            continue;
          }

          try {
            await this.auditsService.runScheduled(schedule.siteId);
            await this.db
              .update(siteSchedules)
              .set({
                lastRunAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(siteSchedules.id, schedule.id));
          } catch (error) {
            this.logger.warn(`Schedule execution failed (${schedule.id}): ${String(error)}`);
            await this.systemLogsService.error(
              SchedulingService.name,
              'Scheduled audit execution failed',
              error,
              {
                scheduleId: schedule.id,
                siteId: schedule.siteId,
              },
            );
          }
        }
      },
    );

    if (executed === null) {
      this.logger.debug('Skipping scheduler tick because another jobs instance owns the lock');
    }
  }

  @Cron('*/5 * * * *')
  async reconcileEmailDeliveries() {
    const lockKey = `${this.configService.get('SCHEDULER_LOCK_KEY', {
      infer: true,
    })}:email-deliveries`;
    const lockTtlMs = this.configService.get('SCHEDULER_LOCK_TTL_MS', { infer: true });

    const executed = await this.distributedLockService.withLock(lockKey, lockTtlMs, async () => {
      const result = await this.notificationsService.reconcilePendingEmailDeliveries();
      if (result.reconciled > 0) {
        this.logger.log(`Reconciled ${result.reconciled} pending email deliveries`);
      }
    });

    if (executed === null) {
      this.logger.debug('Skipping email delivery reconciliation because another instance owns it');
    }
  }

  /**
   * Sweeps audits/exports/outbound deliveries stuck in their initial queued state and
   * re-enqueues them. Catches the rare case where a worker crashed before BullMQ acked the
   * job. Held under a separate lock from the per-minute scheduler so it can run in parallel
   * across replicas without duplicate work.
   */
  @Cron('*/5 * * * *')
  async reconcileQueuedWork() {
    const lockKey = `${this.configService.get('SCHEDULER_LOCK_KEY', {
      infer: true,
    })}:queued-work`;
    const lockTtlMs = this.configService.get('SCHEDULER_LOCK_TTL_MS', { infer: true });

    const executed = await this.distributedLockService.withLock(lockKey, lockTtlMs, async () => {
      const [audits, exportsResult, outbound] = await Promise.all([
        this.auditsService.reconcileQueuedRuns(),
        this.exportsService.reconcilePendingExports(),
        this.outboundWebhooksService.reconcilePendingDeliveries(),
      ]);

      const total = audits.requeued + exportsResult.requeued + outbound.requeued;
      if (total > 0) {
        this.logger.log(
          `Reconciled queued work: audits=${audits.requeued}, exports=${exportsResult.requeued}, outbound=${outbound.requeued}`,
        );
      }
    });

    if (executed === null) {
      this.logger.debug('Skipping queued-work reconciliation because another instance owns it');
    }
  }

  /**
   * Daily Search Console import. Fans out one queued import job per active site↔property link so
   * each site keeps a fresh rolling window (Google finalises data with a ~2-3 day lag, so we
   * re-pull the last few days). Heavy fetching happens in the gsc-import worker, not here.
   */
  @Cron('0 4 * * *')
  async importSearchConsoleData() {
    const lockKey = `${this.configService.get('SCHEDULER_LOCK_KEY', {
      infer: true,
    })}:gsc-import`;
    const lockTtlMs = this.configService.get('SCHEDULER_LOCK_TTL_MS', { infer: true });

    const executed = await this.distributedLockService.withLock(lockKey, lockTtlMs, async () => {
      const links = await this.searchConsoleService.listActiveLinks();
      for (const link of links) {
        try {
          await this.queueService.enqueueGscImport({
            siteId: link.siteId,
            startDate: this.recentImportStartDate(),
            endDate: this.recentImportEndDate(),
          });
        } catch (error) {
          this.logger.warn(
            `Failed to enqueue GSC import for site ${link.siteId}: ${String(error)}`,
          );
          await this.systemLogsService.error(
            SchedulingService.name,
            'Scheduled GSC import enqueue failed',
            error,
            { siteId: link.siteId },
          );
        }
      }
      if (links.length > 0) {
        this.logger.log(`Enqueued ${links.length} Search Console imports`);
      }
    });

    if (executed === null) {
      this.logger.debug('Skipping GSC import tick because another instance owns the lock');
    }
  }

  private recentImportEndDate() {
    const date = DateTime.utc().minus({ days: 2 });
    return date.toISODate() ?? '';
  }

  private recentImportStartDate() {
    const date = DateTime.utc().minus({ days: 5 });
    return date.toISODate() ?? '';
  }
}
