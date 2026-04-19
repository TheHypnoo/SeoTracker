import { Inject, Injectable } from '@nestjs/common';
import {
  AuditStatus,
  EmailDeliveryStatus,
  ExportStatus,
  OutboundDeliveryStatus,
} from '@seotracker/shared-types';
import { count, desc, gte, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type IORedis from 'ioredis';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditExports,
  auditRuns,
  emailDeliveries,
  jobFailures,
  outboundWebhookDeliveries,
} from '../database/schema';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class OperationalStatusService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    private readonly queueService: QueueService,
  ) {}

  async getStatus() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [database, redis, queues, audits, exports, outbound, emails, failures] =
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.queueService.getQueueSummary(),
        this.groupCounts(auditRuns.status, auditRuns, AuditStatus),
        this.groupCounts(auditExports.status, auditExports, ExportStatus),
        this.groupCounts(outboundWebhookDeliveries.status, outboundWebhookDeliveries, {
          FAILED: OutboundDeliveryStatus.FAILED,
          PENDING: OutboundDeliveryStatus.PENDING,
          SUCCESS: OutboundDeliveryStatus.SUCCESS,
        }),
        this.groupCounts(emailDeliveries.status, emailDeliveries, EmailDeliveryStatus),
        this.getRecentFailures(since24h),
      ]);

    const degraded =
      database.status !== 'ok' ||
      redis.status !== 'ok' ||
      failures.failedJobs24h > 0 ||
      emails.FAILED > 0 ||
      outbound.FAILED > 0;

    return {
      generatedAt: new Date().toISOString(),
      status: degraded ? 'degraded' : 'ok',
      checks: { database, redis },
      queues,
      counts: {
        audits,
        emailDeliveries: emails,
        exports,
        outboundDeliveries: outbound,
      },
      failures,
    };
  }

  private async checkDatabase() {
    const startedAt = performance.now();
    try {
      await this.db.execute(sql`select 1`);
      return { responseMs: Math.round(performance.now() - startedAt), status: 'ok' as const };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        responseMs: Math.round(performance.now() - startedAt),
        status: 'fail' as const,
      };
    }
  }

  private async checkRedis() {
    const startedAt = performance.now();
    try {
      await this.redis.ping();
      return { responseMs: Math.round(performance.now() - startedAt), status: 'ok' as const };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        responseMs: Math.round(performance.now() - startedAt),
        status: 'fail' as const,
      };
    }
  }

  private async groupCounts<T extends Record<string, string>>(
    column: PgColumn,
    table: PgTable,
    values: T,
  ) {
    const rows = await this.db
      .select({ status: column, total: count() })
      .from(table)
      .groupBy(column);
    const result = Object.fromEntries(Object.values(values).map((value) => [value, 0])) as Record<
      T[keyof T],
      number
    >;
    for (const row of rows) {
      result[row.status as T[keyof T]] = Number(row.total);
    }
    return result;
  }

  private async getRecentFailures(since: Date) {
    const [totalRow] = await this.db
      .select({ total: count() })
      .from(jobFailures)
      .where(gte(jobFailures.failedAt, since));

    const latest = await this.db
      .select({
        attempts: jobFailures.attempts,
        failedAt: jobFailures.failedAt,
        id: jobFailures.id,
        jobId: jobFailures.jobId,
        jobName: jobFailures.jobName,
        queueName: jobFailures.queueName,
        reason: jobFailures.reason,
      })
      .from(jobFailures)
      .orderBy(desc(jobFailures.failedAt))
      .limit(10);

    return {
      failedJobs24h: Number(totalRow?.total ?? 0),
      latest,
    };
  }
}
