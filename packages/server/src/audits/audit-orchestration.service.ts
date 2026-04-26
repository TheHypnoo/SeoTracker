import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAction, AuditStatus, AuditTrigger, Permission } from '@seotracker/shared-types';
import { and, eq, lt } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';
import { assertPresent } from '../common/utils/assert';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditEvents, auditRuns, sites } from '../database/schema';
import { SitesService } from '../sites/sites.service';
import { QueueService } from '../queue/queue.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

@Injectable()
export class AuditOrchestrationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly queueService: QueueService,
    private readonly sitesService: SitesService,
    private readonly systemLogsService: SystemLogsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async runManual(siteId: string, userId: string) {
    const site = await this.sitesService.getByIdWithPermission(
      siteId,
      userId,
      Permission.AUDIT_RUN,
    );
    const auditRun = await this.createAuditRun(site.id, AuditTrigger.MANUAL);
    await this.queueService.enqueueAuditRun({
      auditRunId: auditRun.id,
      siteId: site.id,
    });

    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.AUDIT_RUN,
      resourceType: 'audit',
      resourceId: auditRun.id,
      siteId: site.id,
      metadata: { trigger: AuditTrigger.MANUAL },
    });

    return auditRun;
  }

  async runScheduled(siteId: string) {
    const [site] = await this.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const auditRun = await this.createAuditRun(site.id, AuditTrigger.SCHEDULED);
    await this.queueService.enqueueAuditRun({
      auditRunId: auditRun.id,
      siteId: site.id,
    });

    return auditRun;
  }

  async runWebhook(siteId: string) {
    const [site] = await this.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const auditRun = await this.createAuditRun(site.id, AuditTrigger.WEBHOOK);
    await this.queueService.enqueueAuditRun({
      auditRunId: auditRun.id,
      siteId: site.id,
    });

    return auditRun;
  }

  async createAuditRun(siteId: string, trigger: AuditTrigger) {
    const [run] = await this.db
      .insert(auditRuns)
      .values({
        siteId,
        trigger,
        status: AuditStatus.QUEUED,
      })
      .returning();

    const savedRun = assertPresent(run, 'Audit run creation did not return a row');

    await this.db.insert(auditEvents).values({
      auditRunId: savedRun.id,
      eventType: 'RUN_QUEUED',
      payload: { trigger },
    });

    return savedRun;
  }

  async markRunFailed(auditRunId: string, reason: string, error?: unknown) {
    await this.db
      .update(auditRuns)
      .set({
        status: AuditStatus.FAILED,
        finishedAt: new Date(),
      })
      .where(eq(auditRuns.id, auditRunId));

    await this.db.insert(auditEvents).values({
      auditRunId,
      eventType: 'RUN_FAILED',
      payload: { reason },
    });

    await this.systemLogsService.error(
      AuditOrchestrationService.name,
      reason,
      error,
      { auditRunId },
      auditRunId,
    );
  }

  /**
   * Reaper for audit runs stuck in QUEUED beyond `staleAfterMs` (default: 60 s). The most common
   * reason is the audits queue dropped a message before any worker accepted it. Re-enqueues the
   * run with a unique jobId suffix so BullMQ does not refuse it as a duplicate.
   */
  async reconcileQueuedRuns(options: { limit?: number; staleAfterMs?: number } = {}) {
    const staleBefore = new Date(Date.now() - (options.staleAfterMs ?? 60_000));
    const candidates = await this.db
      .select({
        id: auditRuns.id,
        siteId: auditRuns.siteId,
      })
      .from(auditRuns)
      .where(and(eq(auditRuns.status, AuditStatus.QUEUED), lt(auditRuns.createdAt, staleBefore)))
      .limit(options.limit ?? 50);

    let requeued = 0;
    for (const run of candidates) {
      try {
        await this.queueService.enqueueAuditRun(
          { auditRunId: run.id, siteId: run.siteId },
          { jobId: `${run.id}:reconcile:${Date.now()}` },
        );
        requeued += 1;
      } catch (error) {
        await this.systemLogsService.error(
          AuditOrchestrationService.name,
          'Queued audit run could not be reconciled',
          error,
          { auditRunId: run.id, siteId: run.siteId },
          run.id,
        );
      }
    }

    return { checked: candidates.length, requeued };
  }
}
