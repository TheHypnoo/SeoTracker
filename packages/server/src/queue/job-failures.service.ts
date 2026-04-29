import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { jobFailures } from '../database/schema';

type RecordFailureInput = {
  queueName: string;
  jobName: string;
  jobId?: string | null | undefined;
  attempts: number;
  payload: Record<string, unknown>;
  reason: string;
  stack?: string | null | undefined;
};

@Injectable()
export class JobFailuresService {
  private readonly logger = new Logger(JobFailuresService.name);
  /** Per-queue throttle so we don't flood the alert channel during incidents. */
  private readonly lastAlertAtByQueue = new Map<string, number>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async record(input: RecordFailureInput) {
    try {
      await this.db.insert(jobFailures).values({
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId ?? null,
        attempts: input.attempts,
        payload: input.payload,
        reason: input.reason,
        stack: input.stack ?? null,
      });
    } catch (error) {
      this.logger.error(`Failed to record job failure: ${String(error)}`);
    }

    void this.dispatchAlert(input).catch((error: unknown) => {
      this.logger.warn(`Job failure alert webhook errored: ${String(error)}`);
    });
  }

  private async dispatchAlert(input: RecordFailureInput) {
    const url = this.configService.get('ALERT_WEBHOOK_URL', { infer: true });
    if (!url) return;

    const minInterval = this.configService.get('ALERT_WEBHOOK_MIN_INTERVAL_MS', {
      infer: true,
    });
    const now = Date.now();
    const last = this.lastAlertAtByQueue.get(input.queueName) ?? 0;
    if (minInterval > 0 && now - last < minInterval) {
      return;
    }
    this.lastAlertAtByQueue.set(input.queueName, now);

    const timeoutMs = this.configService.get('ALERT_WEBHOOK_TIMEOUT_MS', { infer: true });
    const body = {
      text: `[seotracker] job failure on \`${input.queueName}\` (${input.jobName})`,
      queue: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      attempts: input.attempts,
      reason: input.reason,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(
          `Job failure alert webhook returned HTTP ${response.status} for queue ${input.queueName}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Job failure alert webhook for queue ${input.queueName} failed: ${String(error)}`,
      );
    }
  }
}
