import { Injectable } from '@nestjs/common';
import type { IndexabilityStatus } from '@seotracker/shared-types';

import type { PaginationInput } from '../common/dto/pagination.dto';
import { AuditComparisonService } from './audit-comparison.service';
import { AuditOrchestrationService } from './audit-orchestration.service';
import { AuditProcessingService } from './audit-processing.service';
import { AuditReadingService } from './audit-reading.service';
import { SeoActionPlanService } from './seo-action-plan.service';

@Injectable()
export class AuditsService {
  constructor(
    private readonly orchestrationService: AuditOrchestrationService,
    private readonly processingService: AuditProcessingService,
    private readonly comparisonService: AuditComparisonService,
    private readonly readingService: AuditReadingService,
    private readonly actionPlanService: SeoActionPlanService,
  ) {}

  runManual(siteId: string, userId: string) {
    return this.orchestrationService.runManual(siteId, userId);
  }

  runScheduled(siteId: string) {
    return this.orchestrationService.runScheduled(siteId);
  }

  runWebhook(siteId: string) {
    return this.orchestrationService.runWebhook(siteId);
  }

  processQueuedRun(auditRunId: string, perProjectConcurrency: number) {
    return this.processingService.processQueuedRun(auditRunId, perProjectConcurrency);
  }

  reconcileQueuedRuns(options?: { limit?: number; staleAfterMs?: number }) {
    return this.orchestrationService.reconcileQueuedRuns(options);
  }

  listProjectRuns(
    siteId: string,
    userId: string,
    filters?: {
      status?: string | undefined;
      trigger?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      pagination?: PaginationInput | undefined;
    },
  ) {
    return this.readingService.listProjectRuns(siteId, userId, filters);
  }

  listAuditsForProject(
    projectId: string,
    userId: string,
    filters?: {
      siteId?: string;
      status?: string;
      trigger?: string;
      pagination?: PaginationInput;
    },
  ) {
    return this.readingService.listAuditsForProject(projectId, userId, filters);
  }

  getAuditRun(auditId: string, userId: string) {
    return this.readingService.getAuditRun(auditId, userId);
  }

  getAuditIssues(auditId: string, userId: string, pagination?: PaginationInput) {
    return this.readingService.getAuditIssues(auditId, userId, pagination);
  }

  getAuditIndexability(
    auditId: string,
    userId: string,
    filters?: {
      indexabilityStatus?: IndexabilityStatus;
      source?: string;
      pagination?: PaginationInput;
    },
  ) {
    return this.readingService.getAuditIndexability(auditId, userId, filters);
  }

  getSiteActionPlan(siteId: string, userId: string) {
    return this.actionPlanService.getForSite(siteId, userId);
  }

  getAuditActionPlan(auditId: string, userId: string) {
    return this.actionPlanService.getForAudit(auditId, userId);
  }

  getProjectTrends(siteId: string, userId: string, limit?: number) {
    return this.readingService.getProjectTrends(siteId, userId, limit);
  }

  compareProjectRuns(siteId: string, userId: string, fromId?: string, toId?: string) {
    return this.comparisonService.compareProjectRuns(siteId, userId, fromId, toId);
  }

  listProjectComparisons(siteId: string, userId: string, pagination?: PaginationInput) {
    return this.comparisonService.listProjectComparisons(siteId, userId, pagination);
  }
}
