import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  EngineHealthSummary,
  EngineHealthTimeseriesPoint,
  EngineModelVersionStats,
  EngineRunTimeline,
  EngineStageAggregate,
  EngineStageStatus,
} from '@seotracker/shared-types';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditEngineTelemetry, auditRuns, sites } from '../database/schema';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface EngineHealthFilters {
  from?: string | undefined;
  to?: string | undefined;
  siteId?: string | undefined;
  projectId?: string | undefined;
}

/**
 * Read/aggregation layer over `audit_engine_telemetry`. Turns the per-stage
 * execution trace the SEO engine writes on every audit into two products:
 * a per-audit waterfall and an aggregate "engine health" dashboard for the
 * whole platform, optionally filtered by project or site.
 *
 * This is internal observability: every consuming endpoint is gated behind the
 * PlatformAdminGuard, so no per-project authorization is performed here — a
 * platform admin sees telemetry for any site.
 */
@Injectable()
export class EngineTelemetryService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Per-audit stage timeline, in execution order (the waterfall). */
  async getRunTimeline(auditId: string): Promise<EngineRunTimeline> {
    const [run] = await this.db
      .select({ scoringModelVersion: auditRuns.scoringModelVersion })
      .from(auditRuns)
      .where(eq(auditRuns.id, auditId))
      .limit(1);

    if (!run) {
      throw new NotFoundException('Audit not found');
    }

    const rows = await this.db
      .select()
      .from(auditEngineTelemetry)
      .where(eq(auditEngineTelemetry.auditRunId, auditId))
      .orderBy(asc(auditEngineTelemetry.createdAt));

    let totalDurationMs = 0;
    let errorCount = 0;
    const stages = rows.map((row) => {
      totalDurationMs += row.durationMs;
      if (row.status === 'error') errorCount += 1;
      return {
        id: row.id,
        stage: row.stage,
        status: row.status as EngineStageStatus,
        durationMs: row.durationMs,
        error: row.error,
        details: row.details ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return {
      auditId,
      scoringModelVersion: run.scoringModelVersion,
      totalDurationMs,
      stageCount: stages.length,
      errorCount,
      stages,
    };
  }

  /** Aggregate per-stage stats (p50/p95, error rate) over a date range. */
  async getHealth(filters: EngineHealthFilters = {}): Promise<EngineHealthSummary> {
    const { from, to } = this.resolveRange(filters);
    const where = this.healthWhere(filters, from, to);

    const [totals] = await this.db
      .select({
        runCount: sql<number>`count(distinct ${auditEngineTelemetry.auditRunId})`,
        totalSamples: sql<number>`count(*)`,
      })
      .from(auditEngineTelemetry)
      .innerJoin(auditRuns, eq(auditEngineTelemetry.auditRunId, auditRuns.id))
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(where);

    const rows = await this.db
      .select({
        stage: auditEngineTelemetry.stage,
        sampleCount: sql<number>`count(*)`,
        errorCount: sql<number>`count(*) filter (where ${auditEngineTelemetry.status} = 'error')`,
        errorRate: this.errorRateExpr(),
        p50DurationMs: this.percentileExpr(0.5),
        p95DurationMs: this.percentileExpr(0.95),
        avgDurationMs: sql<number>`coalesce(avg(${auditEngineTelemetry.durationMs}), 0)`,
        maxDurationMs: sql<number>`coalesce(max(${auditEngineTelemetry.durationMs}), 0)`,
      })
      .from(auditEngineTelemetry)
      .innerJoin(auditRuns, eq(auditEngineTelemetry.auditRunId, auditRuns.id))
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(where)
      .groupBy(auditEngineTelemetry.stage);

    const stages: EngineStageAggregate[] = rows
      .map((row) => ({
        stage: row.stage,
        sampleCount: Number(row.sampleCount),
        errorCount: Number(row.errorCount),
        errorRate: Number(row.errorRate),
        p50DurationMs: Math.round(Number(row.p50DurationMs)),
        p95DurationMs: Math.round(Number(row.p95DurationMs)),
        avgDurationMs: Math.round(Number(row.avgDurationMs)),
        maxDurationMs: Math.round(Number(row.maxDurationMs)),
      }))
      // Slowest stages first: that is what an operator scans for.
      .sort((a, b) => b.p95DurationMs - a.p95DurationMs);

    return {
      siteId: filters.siteId ?? null,
      projectId: filters.projectId ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      runCount: Number(totals?.runCount ?? 0),
      totalSamples: Number(totals?.totalSamples ?? 0),
      stages,
    };
  }

  /** Daily (date, stage) buckets for the engine-health time series. */
  async getHealthTimeseries(
    filters: EngineHealthFilters & { stage?: string | undefined } = {},
  ): Promise<EngineHealthTimeseriesPoint[]> {
    const { from, to } = this.resolveRange(filters);
    const dayExpr = sql`date_trunc('day', ${auditEngineTelemetry.createdAt})`;
    const clauses = [this.healthWhere(filters, from, to)];
    if (filters.stage) {
      clauses.push(eq(auditEngineTelemetry.stage, filters.stage));
    }

    const rows = await this.db
      .select({
        date: sql<string>`to_char(${dayExpr}, 'YYYY-MM-DD')`,
        stage: auditEngineTelemetry.stage,
        sampleCount: sql<number>`count(*)`,
        errorRate: this.errorRateExpr(),
        p50DurationMs: this.percentileExpr(0.5),
        p95DurationMs: this.percentileExpr(0.95),
      })
      .from(auditEngineTelemetry)
      .innerJoin(auditRuns, eq(auditEngineTelemetry.auditRunId, auditRuns.id))
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(and(...clauses))
      .groupBy(dayExpr, auditEngineTelemetry.stage)
      .orderBy(asc(dayExpr), asc(auditEngineTelemetry.stage));

    return rows.map((row) => ({
      date: row.date,
      stage: row.stage,
      sampleCount: Number(row.sampleCount),
      errorRate: Number(row.errorRate),
      p50DurationMs: Math.round(Number(row.p50DurationMs)),
      p95DurationMs: Math.round(Number(row.p95DurationMs)),
    }));
  }

  /** Per-stage stats grouped by scoring model version (regression detection across versions). */
  async getModelVersionStats(
    filters: EngineHealthFilters = {},
  ): Promise<EngineModelVersionStats[]> {
    const { from, to } = this.resolveRange(filters);

    const rows = await this.db
      .select({
        scoringModelVersion: auditRuns.scoringModelVersion,
        stage: auditEngineTelemetry.stage,
        sampleCount: sql<number>`count(*)`,
        errorRate: this.errorRateExpr(),
        p50DurationMs: this.percentileExpr(0.5),
        p95DurationMs: this.percentileExpr(0.95),
      })
      .from(auditEngineTelemetry)
      .innerJoin(auditRuns, eq(auditEngineTelemetry.auditRunId, auditRuns.id))
      .innerJoin(sites, eq(auditRuns.siteId, sites.id))
      .where(this.healthWhere(filters, from, to))
      .groupBy(auditRuns.scoringModelVersion, auditEngineTelemetry.stage)
      .orderBy(desc(auditRuns.scoringModelVersion), asc(auditEngineTelemetry.stage));

    return rows.map((row) => ({
      scoringModelVersion: row.scoringModelVersion,
      stage: row.stage,
      sampleCount: Number(row.sampleCount),
      errorRate: Number(row.errorRate),
      p50DurationMs: Math.round(Number(row.p50DurationMs)),
      p95DurationMs: Math.round(Number(row.p95DurationMs)),
    }));
  }

  private healthWhere(filters: EngineHealthFilters, from: Date, to: Date) {
    const clauses = [
      gte(auditEngineTelemetry.createdAt, from),
      lte(auditEngineTelemetry.createdAt, to),
    ];
    if (filters.siteId) {
      clauses.push(eq(auditRuns.siteId, filters.siteId));
    }
    if (filters.projectId) {
      clauses.push(eq(sites.projectId, filters.projectId));
    }
    return and(...clauses);
  }

  private errorRateExpr() {
    return sql<number>`coalesce(avg(case when ${auditEngineTelemetry.status} = 'error' then 1 else 0 end), 0)`;
  }

  private percentileExpr(p: number) {
    return sql<number>`coalesce(percentile_cont(${p}) within group (order by ${auditEngineTelemetry.durationMs}), 0)`;
  }

  private resolveRange(range: EngineHealthFilters): { from: Date; to: Date } {
    const to = range.to
      ? new Date(range.to.includes('T') ? range.to : `${range.to}T23:59:59.999Z`)
      : new Date();
    const from = range.from
      ? new Date(range.from.includes('T') ? range.from : `${range.from}T00:00:00.000Z`)
      : new Date(to.getTime() - THIRTY_DAYS_MS);
    return { from, to };
  }
}
