import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import type { Env } from '../config/env.schema';
import {
  AUDIT_QUEUE,
  EMAIL_DELIVERIES_QUEUE,
  EXPORT_QUEUE,
  OUTBOUND_DELIVERIES_QUEUE,
} from './queue.constants';
import type {
  AuditJobData,
  EmailDeliveryJobData,
  ExportJobData,
  OutboundDeliveryJobData,
} from './queue.types';

/**
 * Default cleanup policy applied to every queue.
 * Completed jobs are kept 24h or until 200 entries; failed jobs are kept 7 days or until 1k entries
 * to bound Redis memory while still preserving forensic visibility. Permanent failures are also
 * mirrored into the `job_failures` table.
 */
const COMMON_REMOVE_OPTS = {
  removeOnComplete: { age: 24 * 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
} as const;

/**
 * Producer-side facade over the three BullMQ queues used by the platform:
 *
 * - `audit`: runs the SEO engine against a site (consumed by `apps/jobs`).
 * - `export`: builds CSV/PDF/JSON files asynchronously.
 * - `outbound-deliveries`: posts events to user-registered webhook URLs.
 *
 * `jobId` is set to the domain entity id (auditRunId / exportId / deliveryId) so duplicate
 * enqueues for the same row are deduplicated by BullMQ.
 */
@Injectable()
export class QueueService {
  constructor(
    @Inject(AUDIT_QUEUE) private readonly auditQueue: Queue<AuditJobData>,
    @Inject(EXPORT_QUEUE) private readonly exportQueue: Queue<ExportJobData>,
    @Inject(OUTBOUND_DELIVERIES_QUEUE)
    private readonly outboundQueue: Queue<OutboundDeliveryJobData>,
    @Inject(EMAIL_DELIVERIES_QUEUE)
    private readonly emailQueue: Queue<EmailDeliveryJobData>,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  enqueueAuditRun(payload: AuditJobData, options?: { delayMs?: number; jobId?: string }) {
    return this.auditQueue.add('run-audit', payload, {
      attempts: this.configService.get('AUDIT_QUEUE_ATTEMPTS', { infer: true }),
      backoff: {
        delay: 1_000,
        type: 'exponential',
      },
      ...(options?.delayMs !== undefined ? { delay: options.delayMs } : {}),
      ...COMMON_REMOVE_OPTS,
      jobId: options?.jobId ?? payload.auditRunId,
    });
  }

  enqueueExport(payload: ExportJobData, options?: { delayMs?: number; jobId?: string }) {
    return this.exportQueue.add('build-export', payload, {
      attempts: this.configService.get('EXPORT_QUEUE_ATTEMPTS', { infer: true }),
      backoff: {
        delay: 1_000,
        type: 'exponential',
      },
      ...(options?.delayMs !== undefined ? { delay: options.delayMs } : {}),
      ...COMMON_REMOVE_OPTS,
      jobId: options?.jobId ?? payload.exportId,
    });
  }

  enqueueOutboundDelivery(
    payload: OutboundDeliveryJobData,
    options?: { delayMs?: number; jobId?: string },
  ) {
    return this.outboundQueue.add('deliver-outbound', payload, {
      attempts: this.configService.get('OUTBOUND_QUEUE_ATTEMPTS', { infer: true }),
      backoff: {
        delay: 2_000,
        type: 'exponential',
      },
      ...(options?.delayMs !== undefined ? { delay: options.delayMs } : {}),
      ...COMMON_REMOVE_OPTS,
      jobId: options?.jobId ?? payload.deliveryId,
    });
  }

  enqueueEmailDelivery(
    payload: EmailDeliveryJobData,
    options?: { delayMs?: number; jobId?: string },
  ) {
    return this.emailQueue.add('send-email', payload, {
      attempts: this.configService.get('EMAIL_QUEUE_ATTEMPTS', { infer: true }),
      backoff: {
        delay: 2_000,
        type: 'exponential',
      },
      delay: options?.delayMs,
      ...COMMON_REMOVE_OPTS,
      jobId: options?.jobId ?? payload.deliveryId,
    });
  }

  async getQueueSummary() {
    const entries = [
      { name: 'seo-audits', queue: this.auditQueue },
      { name: 'seo-exports', queue: this.exportQueue },
      { name: 'seo-outbound-deliveries', queue: this.outboundQueue },
      { name: 'seo-email-deliveries', queue: this.emailQueue },
    ];

    return Promise.all(
      entries.map(async ({ name, queue }) => ({
        counts: await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
        name,
      })),
    );
  }
}
