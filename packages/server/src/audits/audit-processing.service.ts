import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditStatus, OutboundEvent, Severity } from '@seotracker/shared-types';
import { and, count, eq, ne } from 'drizzle-orm';

import { AlertsService } from '../alerts/alerts.service';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditEvents,
  auditActionItems,
  auditIssues,
  auditMetrics,
  auditPages,
  auditRuns,
  auditUrlInspections,
  sites,
} from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { QueueService } from '../queue/queue.service';
import { scoreAudit } from '../seo-engine/scoring';
import { SeoEngineService } from '../seo-engine/seo-engine.service';
import { CrawlConfigService } from '../sites/crawl-config.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuditComparisonService } from './audit-comparison.service';
import { AuditOrchestrationService } from './audit-orchestration.service';
import { ProjectIssuesService } from './site-issues.service';
import { buildAuditActionItems } from './action-item-builder';

/**
 * Orchestrates the full lifecycle of an audit run from the worker side.
 *
 * Pipeline:
 *   1. Load the queued run; bail if it's missing or not in QUEUED state.
 *   2. Apply per-project concurrency throttling so a single tenant cannot starve others.
 *   3. Mark the run RUNNING, invoke the SEO engine, and persist pages, issues and metrics.
 *   4. Compute the final score, derive a comparison against the previous run, and update
 *      the cross-run `site_issues` state machine.
 *   5. Fan out side effects: notifications, alerts, outbound webhooks (`audit.completed`/`audit.failed`).
 *
 * Errors are logged via `SystemLogsService` and translated into a FAILED terminal state plus
 * a `audit.failed` outbound event; the worker still acks the job so BullMQ retries follow the
 * configured backoff instead of looping indefinitely.
 */
@Injectable()
export class AuditProcessingService {
  private readonly logger = new Logger(AuditProcessingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly queueService: QueueService,
    private readonly seoEngineService: SeoEngineService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
    private readonly systemLogsService: SystemLogsService,
    private readonly orchestrationService: AuditOrchestrationService,
    private readonly comparisonService: AuditComparisonService,
    private readonly outboundWebhooksService: OutboundWebhooksService,
    private readonly projectIssuesService: ProjectIssuesService,
    private readonly crawlConfigService: CrawlConfigService,
  ) {}

  /**
   * Entry point invoked by the audits worker for each dequeued job.
   * `perProjectConcurrency` caps how many runs can execute concurrently for the same project.
   */
  async processQueuedRun(auditRunId: string, perProjectConcurrency: number) {
    const [run] = await this.db
      .select({
        id: auditRuns.id,
        siteId: auditRuns.siteId,
        status: auditRuns.status,
        trigger: auditRuns.trigger,
      })
      .from(auditRuns)
      .where(eq(auditRuns.id, auditRunId))
      .limit(1);

    if (!run) {
      this.logger.warn(`Audit run ${auditRunId} not found`);
      await this.systemLogsService.warn(
        AuditProcessingService.name,
        'Audit run not found while processing queue',
        { auditRunId },
      );
      return;
    }

    if (run.status !== AuditStatus.QUEUED) {
      return;
    }

    const runningRows = await this.db
      .select({ total: count() })
      .from(auditRuns)
      .where(
        and(
          eq(auditRuns.siteId, run.siteId),
          eq(auditRuns.status, AuditStatus.RUNNING),
          ne(auditRuns.id, run.id),
        ),
      );

    const runningTotal = Number(runningRows[0]?.total ?? 0);
    if (runningTotal >= perProjectConcurrency) {
      await this.queueService.enqueueAuditRun(
        { auditRunId: run.id, siteId: run.siteId },
        { delayMs: 15_000 },
      );
      return;
    }

    const [site] = await this.db
      .select({
        id: sites.id,
        projectId: sites.projectId,
        name: sites.name,
        domain: sites.domain,
        normalizedDomain: sites.normalizedDomain,
      })
      .from(sites)
      .where(eq(sites.id, run.siteId))
      .limit(1);
    if (!site) {
      await this.orchestrationService.markRunFailed(run.id, 'Site not found');
      return;
    }

    await this.db
      .update(auditRuns)
      .set({
        status: AuditStatus.RUNNING,
        startedAt: new Date(),
      })
      .where(eq(auditRuns.id, run.id));

    await this.db.insert(auditEvents).values({
      auditRunId: run.id,
      eventType: 'RUN_STARTED',
      payload: { trigger: run.trigger },
    });

    try {
      const crawlConfig = await this.crawlConfigService.resolve(site.id);
      const analysis = await this.seoEngineService.analyzeDomain(site.normalizedDomain, {
        maxPages: crawlConfig.maxPages,
        maxDepth: crawlConfig.maxDepth,
        userAgent: crawlConfig.userAgent,
      });
      const urlInspections = analysis.urlInspections ?? [];
      const actionItems = buildAuditActionItems({
        issues: analysis.issues,
        run: { id: run.id, score: analysis.score },
        site: { domain: site.domain, name: site.name },
      });

      await this.db.transaction(async (tx) => {
        await tx
          .update(auditRuns)
          .set({
            status: AuditStatus.COMPLETED,
            finishedAt: new Date(),
            httpStatus: analysis.httpStatus,
            responseMs: analysis.responseMs,
            score: analysis.score,
            categoryScores: analysis.categoryScores,
            scoreBreakdown: analysis.scoreBreakdown,
          })
          .where(eq(auditRuns.id, run.id));

        if (analysis.pages.length) {
          await tx.insert(auditPages).values(
            analysis.pages.map((page) => ({
              auditRunId: run.id,
              url: page.url,
              statusCode: page.statusCode,
              responseMs: page.responseMs,
              contentType: page.contentType,
              score: page.score,
            })),
          );
        }

        if (analysis.metrics.length) {
          await tx.insert(auditMetrics).values(
            analysis.metrics.map((metric) => ({
              auditRunId: run.id,
              key: metric.key,
              valueNum: metric.valueNum,
              valueText: metric.valueText,
            })),
          );
        }

        if (analysis.issues.length) {
          await tx.insert(auditIssues).values(
            analysis.issues.map((issue) => ({
              auditRunId: run.id,
              issueCode: issue.issueCode,
              category: issue.category,
              severity: issue.severity,
              message: issue.message,
              resourceUrl: issue.resourceUrl,
              meta: issue.meta,
            })),
          );
        }

        if (urlInspections.length) {
          await tx.insert(auditUrlInspections).values(
            urlInspections.map((inspection) => ({
              auditRunId: run.id,
              url: inspection.url,
              source: inspection.source,
              statusCode: inspection.statusCode,
              indexabilityStatus: inspection.indexabilityStatus,
              canonicalUrl: inspection.canonicalUrl,
              robotsDirective: inspection.robotsDirective,
              xRobotsTag: inspection.xRobotsTag,
              sitemapIncluded: inspection.sitemapIncluded,
              evidence: inspection.evidence,
            })),
          );
        }

        if (actionItems.length) {
          await tx.insert(auditActionItems).values(
            actionItems.map((action) => ({
              affectedPages: action.affectedPages,
              affectedPagesCount: action.affectedPagesCount,
              auditRunId: run.id,
              category: action.category,
              effort: action.effort,
              evidenceSummary: action.evidenceSummary,
              impact: action.impact,
              issueCode: action.issueCode,
              occurrences: action.occurrences,
              priorityReason: action.priorityReason,
              priorityScore: action.priorityScore,
              recommendedAction: action.recommendedAction,
              remediationPrompt: action.remediationPrompt,
              scoreImpactPoints: action.scoreImpactPoints,
              severity: action.severity,
            })),
          );
        }

        await tx.insert(auditEvents).values({
          auditRunId: run.id,
          eventType: 'RUN_COMPLETED',
          payload: {
            score: analysis.score,
            issues: analysis.issues.length,
          },
        });
      });

      // Reconcile + rescore are best-effort post-processing: the audit is
      // already persisted, so a failure here must not abort the run, but it
      // MUST be surfaced (system_logs + pino) so silent drift can be caught.
      try {
        await this.projectIssuesService.reconcileAfterRun(site.id, run.id);
      } catch (reconcileError) {
        this.logger.error(
          `Failed to reconcile site issues for run ${run.id}: ${String(reconcileError)}`,
        );
        await this.systemLogsService.warn(
          AuditProcessingService.name,
          'Failed to reconcile site issues after audit run',
          { auditRunId: run.id, siteId: site.id, error: String(reconcileError) },
        );
      }

      try {
        const ignoredFingerprints = await this.projectIssuesService.getIgnoredFingerprints(site.id);
        if (ignoredFingerprints.size > 0) {
          const filtered = analysis.issues.filter((issue) => {
            const key = `${issue.issueCode}::${ProjectIssuesService.fingerprintResource(
              issue.resourceUrl,
            )}`;
            return !ignoredFingerprints.has(key);
          });
          const homepageUrl = analysis.pages[0]?.url ?? `https://${site.normalizedDomain}`;
          const rescored = scoreAudit(filtered, analysis.pages, homepageUrl);

          await this.db.transaction(async (tx) => {
            await tx
              .update(auditRuns)
              .set({
                score: rescored.score,
                categoryScores: rescored.categoryScores,
                scoreBreakdown: rescored.breakdown,
              })
              .where(eq(auditRuns.id, run.id));

            for (const page of analysis.pages) {
              const newScore = rescored.pageScores.get(page.url);
              if (typeof newScore === 'number') {
                await tx
                  .update(auditPages)
                  .set({ score: newScore })
                  .where(and(eq(auditPages.auditRunId, run.id), eq(auditPages.url, page.url)));
              }
            }
          });

          analysis.score = rescored.score;
          analysis.categoryScores = rescored.categoryScores;
          analysis.scoreBreakdown = rescored.breakdown;
        }
      } catch (rescoreError) {
        this.logger.error(
          `Failed to rescore after ignoring issues for run ${run.id}: ${String(rescoreError)}`,
        );
        await this.systemLogsService.warn(
          AuditProcessingService.name,
          'Failed to rescore audit run after ignoring issues',
          { auditRunId: run.id, siteId: site.id, error: String(rescoreError) },
        );
      }

      const comparison = await this.comparisonService.persistComparisonForRun({
        site: {
          id: site.id,
          name: site.name,
          domain: site.domain,
          projectId: site.projectId,
        },
        targetRunId: run.id,
      });

      await this.notificationsService.createForProjectMembers(site.projectId, {
        type: 'AUDIT_COMPLETED',
        title: `Auditoria finalizada: ${site.name}`,
        body: `Score ${analysis.score}. Problemas detectados: ${analysis.issues.length}.`,
      });

      await this.notificationsService.sendEmailToProjectMembers(
        site.projectId,
        {
          subject: `SEOTracker - Auditoria completada (${site.name})`,
          text: `Proyecto: ${site.name}\nDominio: ${site.domain}\nScore: ${analysis.score}\nIssues: ${analysis.issues.length}`,
        },
        { bestEffort: true, notificationType: 'AUDIT_COMPLETED' },
      );

      const criticalCount = analysis.issues.filter(
        (issue) => issue.severity === Severity.CRITICAL,
      ).length;

      await this.outboundWebhooksService.dispatch({
        projectId: site.projectId,
        event: OutboundEvent.AUDIT_COMPLETED,
        payload: {
          auditRunId: run.id,
          site: {
            id: site.id,
            name: site.name,
            domain: site.domain,
          },
          score: analysis.score,
          httpStatus: analysis.httpStatus,
          responseMs: analysis.responseMs,
          issuesCount: analysis.issues.length,
          criticalIssuesCount: criticalCount,
          trigger: run.trigger,
          finishedAt: new Date().toISOString(),
        },
      });

      if (criticalCount > 0) {
        await this.outboundWebhooksService.dispatch({
          projectId: site.projectId,
          event: OutboundEvent.ISSUE_CRITICAL,
          payload: {
            auditRunId: run.id,
            site: {
              id: site.id,
              name: site.name,
              domain: site.domain,
            },
            criticalIssuesCount: criticalCount,
          },
        });
      }

      if (comparison) {
        await this.alertsService.evaluateRegression(
          {
            id: site.id,
            name: site.name,
            domain: site.domain,
            projectId: site.projectId,
          },
          comparison,
        );

        if ((comparison.scoreDelta ?? 0) < 0) {
          await this.outboundWebhooksService.dispatch({
            projectId: site.projectId,
            event: OutboundEvent.SITE_REGRESSION,
            payload: {
              auditRunId: run.id,
              site: {
                id: site.id,
                name: site.name,
                domain: site.domain,
              },
              scoreDelta: comparison.scoreDelta,
              comparisonId: comparison.id,
            },
          });
        }
      }
    } catch (error) {
      await this.orchestrationService.markRunFailed(run.id, String(error), error);
      this.logger.error(`Audit run failed (${run.id}): ${String(error)}`);
      try {
        await this.outboundWebhooksService.dispatch({
          projectId: site.projectId,
          event: OutboundEvent.AUDIT_FAILED,
          payload: {
            auditRunId: run.id,
            site: {
              id: site.id,
              name: site.name,
              domain: site.domain,
            },
            reason: String(error),
          },
        });
      } catch (dispatchError) {
        this.logger.error(
          `Failed to dispatch AUDIT_FAILED webhook for run ${run.id}: ${String(dispatchError)}`,
        );
      }
    }
  }
}
