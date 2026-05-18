import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditStatus,
  type AuditTrigger,
  type IndexabilityStatus,
  type PaginatedResponse,
  Severity,
} from '@seotracker/shared-types';
import { and, count, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';

import { DEFAULT_PAGINATION, type PaginationInput } from '../common/dto/pagination.dto';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditEvents,
  auditIssues,
  auditMetrics,
  auditPages,
  auditRuns,
  auditUrlInspections,
  siteIssues,
  sites,
} from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { SitesService } from '../sites/sites.service';

type AuditRunRow = typeof auditRuns.$inferSelect;

@Injectable()
export class AuditReadingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listProjectRuns(
    siteId: string,
    userId: string,
    filters?: {
      status?: string | undefined;
      trigger?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      pagination?: PaginationInput | undefined;
    },
  ): Promise<
    PaginatedResponse<AuditRunRow & { issuesCount: number; criticalIssuesCount: number }>
  > {
    await this.sitesService.getById(siteId, userId);

    const { limit, offset } = filters?.pagination ?? { limit: 50, offset: 0 };

    const whereClauses = [eq(auditRuns.siteId, siteId)];
    if (filters?.status) {
      whereClauses.push(eq(auditRuns.status, filters.status as AuditStatus));
    }
    if (filters?.trigger) {
      whereClauses.push(eq(auditRuns.trigger, filters.trigger as AuditTrigger));
    }
    if (filters?.from) {
      const fromDate = new Date(filters.from);
      if (!Number.isNaN(fromDate.valueOf())) {
        whereClauses.push(gte(auditRuns.createdAt, fromDate));
      }
    }
    if (filters?.to) {
      const toDate = new Date(filters.to);
      if (!Number.isNaN(toDate.valueOf())) {
        whereClauses.push(lte(auditRuns.createdAt, toDate));
      }
    }

    const whereCondition = whereClauses.length > 1 ? and(...whereClauses) : whereClauses[0];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditRuns)
      .where(whereCondition);

    const runs = await this.db
      .select()
      .from(auditRuns)
      .where(whereCondition)
      .orderBy(desc(auditRuns.createdAt))
      .limit(limit)
      .offset(offset);

    const runIds = runs.map((run) => run.id);
    const [issueCounts, criticalIssueCounts] = await Promise.all([
      runIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(inArray(auditIssues.auditRunId, runIds))
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
      runIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(
              and(
                inArray(auditIssues.auditRunId, runIds),
                eq(auditIssues.severity, Severity.CRITICAL),
              ),
            )
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
    ]);

    const issueCountByRun = new Map(issueCounts.map((row) => [row.auditRunId, Number(row.total)]));
    const criticalCountByRun = new Map(
      criticalIssueCounts.map((row) => [row.auditRunId, Number(row.total)]),
    );

    const items = runs.map((run) => ({
      ...run,
      criticalIssuesCount: criticalCountByRun.get(run.id) ?? 0,
      issuesCount: issueCountByRun.get(run.id) ?? 0,
    }));

    return { items, limit, offset, total: Number(totalRow?.total ?? 0) };
  }

  async listAuditsForProject(
    projectId: string,
    userId: string,
    filters?: {
      siteId?: string;
      status?: string;
      trigger?: string;
      pagination?: PaginationInput;
    },
  ): Promise<
    PaginatedResponse<
      AuditRunRow & {
        issuesCount: number;
        criticalIssuesCount: number;
        siteName: string;
        siteDomain: string;
      }
    >
  > {
    await this.projectsService.assertMember(projectId, userId);

    const { limit, offset } = filters?.pagination ?? { limit: 50, offset: 0 };

    const whereClauses = [eq(sites.projectId, projectId)];
    if (filters?.siteId) {
      whereClauses.push(eq(auditRuns.siteId, filters.siteId));
    }
    if (filters?.status) {
      whereClauses.push(eq(auditRuns.status, filters.status as AuditStatus));
    }
    if (filters?.trigger) {
      whereClauses.push(eq(auditRuns.trigger, filters.trigger as AuditTrigger));
    }
    const whereCondition = whereClauses.length > 1 ? and(...whereClauses) : whereClauses[0];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditRuns)
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(whereCondition);

    const runs = await this.db
      .select({
        run: auditRuns,
        siteDomain: sites.domain,
        siteName: sites.name,
      })
      .from(auditRuns)
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(whereCondition)
      .orderBy(desc(auditRuns.createdAt))
      .limit(limit)
      .offset(offset);

    const runIds = runs.map((row) => row.run.id);
    const [issueCounts, criticalIssueCounts] = await Promise.all([
      runIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(inArray(auditIssues.auditRunId, runIds))
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
      runIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(
              and(
                inArray(auditIssues.auditRunId, runIds),
                eq(auditIssues.severity, Severity.CRITICAL),
              ),
            )
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
    ]);

    const issueCountByRun = new Map(issueCounts.map((row) => [row.auditRunId, Number(row.total)]));
    const criticalCountByRun = new Map(
      criticalIssueCounts.map((row) => [row.auditRunId, Number(row.total)]),
    );

    const items = runs.map(({ run, siteName, siteDomain }) => ({
      ...run,
      criticalIssuesCount: criticalCountByRun.get(run.id) ?? 0,
      issuesCount: issueCountByRun.get(run.id) ?? 0,
      siteDomain,
      siteName,
    }));

    return { items, limit, offset, total: Number(totalRow?.total ?? 0) };
  }

  async getAuditRun(auditId: string, userId: string) {
    const [run] = await this.db
      .select({
        categoryScores: auditRuns.categoryScores,
        createdAt: auditRuns.createdAt,
        finishedAt: auditRuns.finishedAt,
        httpStatus: auditRuns.httpStatus,
        id: auditRuns.id,
        responseMs: auditRuns.responseMs,
        score: auditRuns.score,
        scoreBreakdown: auditRuns.scoreBreakdown,
        siteId: auditRuns.siteId,
        startedAt: auditRuns.startedAt,
        status: auditRuns.status,
        trigger: auditRuns.trigger,
      })
      .from(auditRuns)
      .where(eq(auditRuns.id, auditId))
      .limit(1);

    if (!run) {
      throw new NotFoundException('Audit not found');
    }

    const site = await this.sitesService.getById(run.siteId, userId);

    const [metrics, pages, severityRows, failureEvent, previousRuns] = await Promise.all([
      this.db.select().from(auditMetrics).where(eq(auditMetrics.auditRunId, run.id)),
      this.db
        .select()
        .from(auditPages)
        .where(eq(auditPages.auditRunId, run.id))
        .orderBy(desc(auditPages.createdAt)),
      this.db
        .select({ severity: auditIssues.severity, total: count() })
        .from(auditIssues)
        .where(eq(auditIssues.auditRunId, run.id))
        .groupBy(auditIssues.severity),
      run.status === AuditStatus.FAILED
        ? this.db
            .select({ createdAt: auditEvents.createdAt, payload: auditEvents.payload })
            .from(auditEvents)
            .where(and(eq(auditEvents.auditRunId, run.id), eq(auditEvents.eventType, 'RUN_FAILED')))
            .orderBy(desc(auditEvents.createdAt))
            .limit(1)
        : Promise.resolve([] as { payload: Record<string, unknown>; createdAt: Date }[]),
      this.db
        .select({ score: auditRuns.score })
        .from(auditRuns)
        .where(
          and(
            eq(auditRuns.siteId, run.siteId),
            eq(auditRuns.status, AuditStatus.COMPLETED),
            lt(auditRuns.createdAt, run.createdAt),
          ),
        )
        .orderBy(desc(auditRuns.createdAt))
        .limit(1),
    ]);

    const previousScore = previousRuns[0]?.score ?? null;
    const scoreDelta =
      run.score !== null && previousScore !== null ? run.score - previousScore : null;

    const firstFailure = failureEvent[0];
    const failureReason =
      firstFailure && typeof firstFailure.payload.reason === 'string'
        ? (firstFailure.payload.reason as string)
        : null;

    const severityCounts: Record<Severity, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
    };
    let issuesTotal = 0;
    for (const row of severityRows) {
      const value = Number(row.total);
      severityCounts[row.severity as Severity] = value;
      issuesTotal += value;
    }

    return {
      ...run,
      failureReason,
      issuesCount: issuesTotal,
      metrics,
      pages,
      previousScore,
      scoreDelta,
      severityCounts,
      site: {
        domain: site.domain,
        id: site.id,
        name: site.name,
      },
    };
  }

  async getProjectTrends(siteId: string, userId: string, limit = 30) {
    await this.sitesService.getById(siteId, userId);

    const rows = await this.db
      .select({
        categoryScores: auditRuns.categoryScores,
        createdAt: auditRuns.createdAt,
        finishedAt: auditRuns.finishedAt,
        id: auditRuns.id,
        score: auditRuns.score,
      })
      .from(auditRuns)
      .where(and(eq(auditRuns.siteId, siteId), eq(auditRuns.status, AuditStatus.COMPLETED)))
      .orderBy(desc(auditRuns.createdAt))
      .limit(limit);

    const ordered = rows.toReversed();
    const points = ordered.map((row, idx) => {
      const prev = ordered[idx - 1];
      const prevScore = prev?.score;
      const delta =
        prevScore !== undefined && prevScore !== null && row.score !== null
          ? row.score - prevScore
          : null;
      return {
        categoryScores: row.categoryScores,
        id: row.id,
        score: row.score,
        scoreDelta: delta,
        timestamp: (row.finishedAt ?? row.createdAt).toISOString(),
      };
    });

    return { points };
  }

  async getAuditIssues(
    auditId: string,
    userId: string,
    pagination: PaginationInput = DEFAULT_PAGINATION,
  ): Promise<
    PaginatedResponse<
      typeof auditIssues.$inferSelect & {
        projectIssueId: string | null;
        state: string | null;
        firstSeenAt: Date | null;
        lastSeenAt: Date | null;
      }
    >
  > {
    const [run] = await this.db
      .select({ siteId: auditRuns.siteId })
      .from(auditRuns)
      .where(eq(auditRuns.id, auditId))
      .limit(1);

    if (!run) {
      throw new NotFoundException('Audit not found');
    }

    await this.sitesService.getById(run.siteId, userId);

    const { limit, offset } = pagination;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditIssues)
      .where(eq(auditIssues.auditRunId, auditId));

    const issues = await this.db
      .select()
      .from(auditIssues)
      .where(eq(auditIssues.auditRunId, auditId))
      .orderBy(desc(auditIssues.createdAt))
      .limit(limit)
      .offset(offset);

    const issueCodes = [...new Set(issues.map((issue) => issue.issueCode))];

    const states = issueCodes.length
      ? await this.db
          .select({
            firstSeenAt: siteIssues.firstSeenAt,
            id: siteIssues.id,
            issueCode: siteIssues.issueCode,
            lastSeenAt: siteIssues.lastSeenAt,
            resourceKey: siteIssues.resourceKey,
            state: siteIssues.state,
          })
          .from(siteIssues)
          .where(and(eq(siteIssues.siteId, run.siteId), inArray(siteIssues.issueCode, issueCodes)))
      : [];

    const byKey = new Map<string, (typeof states)[number]>();
    for (const row of states) {
      byKey.set(`${row.issueCode}::${row.resourceKey}`, row);
    }

    const items = issues.map((issue) => {
      const resourceKey = (issue.resourceUrl ?? '').trim();
      const key = `${issue.issueCode}::${resourceKey}`;
      const stateRow = byKey.get(key);
      return {
        ...issue,
        firstSeenAt: stateRow?.firstSeenAt ?? null,
        lastSeenAt: stateRow?.lastSeenAt ?? null,
        projectIssueId: stateRow?.id ?? null,
        state: stateRow?.state ?? null,
      };
    });

    return { items, limit, offset, total: Number(totalRow?.total ?? 0) };
  }

  async getAuditIndexability(
    auditId: string,
    userId: string,
    filters: {
      indexabilityStatus?: IndexabilityStatus;
      source?: string;
      pagination?: PaginationInput;
    } = {},
  ) {
    const [run] = await this.db
      .select({ siteId: auditRuns.siteId })
      .from(auditRuns)
      .where(eq(auditRuns.id, auditId))
      .limit(1);

    if (!run) {
      throw new NotFoundException('Audit not found');
    }

    await this.sitesService.getById(run.siteId, userId);

    const { limit, offset } = filters.pagination ?? { limit: 50, offset: 0 };
    const whereCondition = and(
      eq(auditUrlInspections.auditRunId, auditId),
      filters.indexabilityStatus
        ? eq(auditUrlInspections.indexabilityStatus, filters.indexabilityStatus)
        : undefined,
      filters.source ? eq(auditUrlInspections.source, filters.source) : undefined,
    );

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditUrlInspections)
      .where(whereCondition);

    const items = await this.db
      .select()
      .from(auditUrlInspections)
      .where(whereCondition)
      .orderBy(desc(auditUrlInspections.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, limit, offset, total: Number(totalRow?.total ?? 0) };
  }
}
