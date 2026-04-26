import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, ComparisonChangeType } from '@seotracker/shared-types';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { PaginationInput } from '../common/dto/pagination.dto';
import { assertPresent } from '../common/utils/assert';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditComparisonChanges,
  auditComparisons,
  auditIssues,
  auditRuns,
} from '../database/schema';
import { SitesService } from '../sites/sites.service';

type AuditRunRow = typeof auditRuns.$inferSelect;
type AuditIssueRow = typeof auditIssues.$inferSelect;

@Injectable()
export class AuditComparisonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
  ) {}

  async compareProjectRuns(siteId: string, userId: string, fromId?: string, toId?: string) {
    await this.sitesService.getById(siteId, userId);

    const [fromRun, toRun] = await this.resolveRuns(siteId, fromId, toId);

    if (!fromRun || !toRun) {
      throw new NotFoundException('Two audit runs are required for comparison');
    }

    const existing = await this.getStoredComparison(fromRun.id, toRun.id);
    if (existing) {
      return existing;
    }

    return this.buildComparisonSnapshot(siteId, fromRun, toRun);
  }

  async listProjectComparisons(
    siteId: string,
    userId: string,
    pagination: PaginationInput = { limit: 50, offset: 0 },
  ) {
    await this.sitesService.getById(siteId, userId);

    const { limit, offset } = pagination;

    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditComparisons)
      .where(eq(auditComparisons.siteId, siteId));
    const total = Number(totalRows[0]?.total ?? 0);

    const comparisons = await this.db
      .select()
      .from(auditComparisons)
      .where(eq(auditComparisons.siteId, siteId))
      .orderBy(desc(auditComparisons.createdAt))
      .limit(limit)
      .offset(offset);

    if (!comparisons.length) {
      return { items: [], limit, offset, total };
    }

    const runIds = comparisons.flatMap((comparison) => [
      comparison.baselineAuditRunId,
      comparison.targetAuditRunId,
    ]);
    const runs = await this.db.select().from(auditRuns).where(inArray(auditRuns.id, runIds));
    const runsById = new Map(runs.map((run) => [run.id, run]));

    const items = comparisons.map((comparison) => ({
      ...comparison,
      baselineRun: runsById.get(comparison.baselineAuditRunId) ?? null,
      targetRun: runsById.get(comparison.targetAuditRunId) ?? null,
    }));

    return { items, limit, offset, total };
  }

  async resolveRuns(siteId: string, fromId?: string, toId?: string) {
    if (fromId && toId) {
      const rows = await this.db
        .select()
        .from(auditRuns)
        .where(and(eq(auditRuns.siteId, siteId), inArray(auditRuns.id, [fromId, toId])));
      const from = rows.find((row) => row.id === fromId);
      const to = rows.find((row) => row.id === toId);
      return [from, to] as const;
    }

    const rows = await this.db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.siteId, siteId))
      .orderBy(desc(auditRuns.createdAt))
      .limit(2);
    return [rows[1], rows[0]] as const;
  }

  async persistComparisonForRun(params: {
    site: {
      id: string;
      name: string;
      domain: string;
      projectId: string;
    };
    targetRunId: string;
  }) {
    const completedRuns = await this.db
      .select()
      .from(auditRuns)
      .where(and(eq(auditRuns.siteId, params.site.id), eq(auditRuns.status, AuditStatus.COMPLETED)))
      .orderBy(desc(auditRuns.createdAt))
      .limit(2);

    const targetRun = completedRuns.find((run) => run.id === params.targetRunId);
    const baselineRun = completedRuns.find((run) => run.id !== params.targetRunId);

    if (!targetRun || !baselineRun) {
      return null;
    }

    const [existing] = await this.db
      .select()
      .from(auditComparisons)
      .where(
        and(
          eq(auditComparisons.baselineAuditRunId, baselineRun.id),
          eq(auditComparisons.targetAuditRunId, targetRun.id),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const comparisonSnapshot = await this.buildComparisonSnapshot(
      params.site.id,
      baselineRun,
      targetRun,
    );

    const [comparison] = await this.db
      .insert(auditComparisons)
      .values({
        baselineAuditRunId: baselineRun.id,
        improvementsCount: comparisonSnapshot.summary.improvementsCount,
        issuesDelta: comparisonSnapshot.delta.issues,
        regressionsCount: comparisonSnapshot.summary.regressionsCount,
        scoreDelta: comparisonSnapshot.delta.score,
        siteId: params.site.id,
        targetAuditRunId: targetRun.id,
      })
      .returning();

    const savedComparison = assertPresent(
      comparison,
      'Audit comparison creation did not return a row',
    );

    if (comparisonSnapshot.changes.length) {
      await this.db.insert(auditComparisonChanges).values(
        comparisonSnapshot.changes.map((change) => ({
          changeType: change.changeType,
          comparisonId: savedComparison.id,
          delta: change.delta,
          issueCategory: change.issueCategory,
          issueCode: change.issueCode,
          meta: change.meta,
          severity: change.severity,
          title: change.title,
        })),
      );
    }

    return savedComparison;
  }

  async getStoredComparison(fromRunId: string, toRunId: string) {
    const [comparison] = await this.db
      .select()
      .from(auditComparisons)
      .where(
        and(
          eq(auditComparisons.baselineAuditRunId, fromRunId),
          eq(auditComparisons.targetAuditRunId, toRunId),
        ),
      )
      .limit(1);

    if (!comparison) {
      return null;
    }

    const [fromRun, toRun, changes] = await Promise.all([
      this.db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.id, fromRunId))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.id, toRunId))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(auditComparisonChanges)
        .where(eq(auditComparisonChanges.comparisonId, comparison.id)),
    ]);

    if (!fromRun || !toRun) {
      return null;
    }

    const [fromIssues, toIssues] = await Promise.all([
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, fromRun.id)),
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, toRun.id)),
    ]);

    const bySeverity = (items: AuditIssueRow[]) =>
      items.reduce<Record<string, number>>((acc, item) => {
        acc[item.severity] = (acc[item.severity] ?? 0) + 1;
        return acc;
      }, {});

    return {
      changes,
      comparison,
      delta: {
        issues: comparison.issuesDelta,
        score: comparison.scoreDelta,
      },
      from: {
        run: fromRun,
        severity: bySeverity(fromIssues),
      },
      summary: {
        improvementsCount: comparison.improvementsCount,
        regressionsCount: comparison.regressionsCount,
      },
      to: {
        run: toRun,
        severity: bySeverity(toIssues),
      },
    };
  }

  async buildComparisonSnapshot(siteId: string, fromRun: AuditRunRow, toRun: AuditRunRow) {
    const [fromIssues, toIssues] = await Promise.all([
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, fromRun.id)),
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, toRun.id)),
    ]);

    const bySeverity = (items: AuditIssueRow[]) =>
      items.reduce<Record<string, number>>((acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
        return acc;
      }, {});

    const toSignature = (issue: AuditIssueRow) =>
      [issue.issueCode, issue.resourceUrl ?? '', issue.message].join('::');

    const aggregateIssues = (items: AuditIssueRow[]) => {
      const map = new Map<
        string,
        {
          issueCode: AuditIssueRow['issueCode'];
          issueCategory: AuditIssueRow['category'];
          severity: AuditIssueRow['severity'];
          title: string;
          meta: Record<string, unknown>;
          count: number;
        }
      >();

      for (const issue of items) {
        const key = toSignature(issue);
        const current = map.get(key);

        if (current) {
          current.count += 1;
          continue;
        }

        map.set(key, {
          count: 1,
          issueCategory: issue.category,
          issueCode: issue.issueCode,
          meta: {
            resourceUrl: issue.resourceUrl,
          },
          severity: issue.severity,
          title: issue.message,
        });
      }

      return map;
    };

    const baseline = aggregateIssues(fromIssues);
    const target = aggregateIssues(toIssues);
    const allKeys = new Set([...baseline.keys(), ...target.keys()]);
    const changes: {
      changeType: ComparisonChangeType;
      issueCode: AuditIssueRow['issueCode'] | null;
      issueCategory: AuditIssueRow['category'] | null;
      severity: AuditIssueRow['severity'] | null;
      title: string;
      delta: number | null;
      meta: Record<string, unknown>;
    }[] = [];

    const scoreDelta = (toRun.score ?? 0) - (fromRun.score ?? 0);
    if (scoreDelta < 0) {
      changes.push({
        changeType: ComparisonChangeType.SCORE_DROP,
        delta: scoreDelta,
        issueCategory: null,
        issueCode: null,
        meta: {
          siteId,
        },
        severity: null,
        title: 'Descenso de puntuación SEO',
      });
    }

    if (scoreDelta > 0) {
      changes.push({
        changeType: ComparisonChangeType.SCORE_IMPROVEMENT,
        delta: scoreDelta,
        issueCategory: null,
        issueCode: null,
        meta: {
          siteId,
        },
        severity: null,
        title: 'Mejora de puntuación SEO',
      });
    }

    for (const key of allKeys) {
      const left = baseline.get(key);
      const right = target.get(key);
      const delta = (right?.count ?? 0) - (left?.count ?? 0);

      if (delta === 0) {
        continue;
      }

      changes.push({
        changeType:
          delta > 0 ? ComparisonChangeType.NEW_ISSUE : ComparisonChangeType.RESOLVED_ISSUE,
        delta,
        issueCategory: right?.issueCategory ?? left?.issueCategory ?? null,
        issueCode: right?.issueCode ?? left?.issueCode ?? null,
        meta: right?.meta ?? left?.meta ?? {},
        severity: right?.severity ?? left?.severity ?? null,
        title: right?.title ?? left?.title ?? 'Cambio en incidencias',
      });
    }

    const summary = {
      improvementsCount: changes.filter(
        (change) =>
          change.changeType === ComparisonChangeType.SCORE_IMPROVEMENT ||
          change.changeType === ComparisonChangeType.RESOLVED_ISSUE,
      ).length,
      regressionsCount: changes.filter(
        (change) =>
          change.changeType === ComparisonChangeType.SCORE_DROP ||
          change.changeType === ComparisonChangeType.NEW_ISSUE,
      ).length,
    };

    const comparisonRow = {
      baselineAuditRunId: fromRun.id,
      createdAt: new Date(),
      id: 'transient',
      improvementsCount: summary.improvementsCount,
      issuesDelta: toIssues.length - fromIssues.length,
      regressionsCount: summary.regressionsCount,
      scoreDelta,
      siteId,
      targetAuditRunId: toRun.id,
    };

    return {
      changes,
      comparison: comparisonRow,
      delta: {
        issues: toIssues.length - fromIssues.length,
        score: scoreDelta,
      },
      from: {
        run: fromRun,
        severity: bySeverity(fromIssues),
      },
      summary,
      to: {
        run: toRun,
        severity: bySeverity(toIssues),
      },
    };
  }
}
