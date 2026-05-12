import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import {
  ActivityAction,
  type IssueCategory,
  IssueState,
  Permission,
  type Severity,
} from '@seotracker/shared-types';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';
import type { PaginationInput } from '../common/dto/pagination.dto';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditIssues, siteIssues, sites } from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { SitesService } from '../sites/sites.service';

const SITE_LEVEL_KEY = '';

function fingerprintResource(resourceUrl: string | null | undefined) {
  const value = (resourceUrl ?? '').trim();
  return value.length ? value : SITE_LEVEL_KEY;
}

/**
 * Wrap an IssueState constant as a SQL literal cast to the `issue_state` enum.
 * Required inside CASE expressions: drizzle 0.45.x serialises plain string
 * params as `text`, and Postgres refuses to compare `text = issue_state` even
 * when the values are valid enum members.
 */
function stateLiteral(value: IssueState) {
  return sql`${value}::issue_state`;
}

@Injectable()
export class ProjectIssuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
    private readonly projectsService: ProjectsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async reconcileAfterRun(siteId: string, auditRunId: string) {
    const now = new Date();

    const rows = await this.db
      .select({
        issueCode: auditIssues.issueCode,
        resourceUrl: auditIssues.resourceUrl,
        severity: auditIssues.severity,
        category: auditIssues.category,
        message: auditIssues.message,
      })
      .from(auditIssues)
      .where(eq(auditIssues.auditRunId, auditRunId));

    type Accum = {
      issueCode: (typeof auditIssues.issueCode.enumValues)[number];
      resourceKey: string;
      severity: (typeof auditIssues.severity.enumValues)[number];
      category: (typeof auditIssues.category.enumValues)[number];
      message: string;
      count: number;
    };

    const byKey = new Map<string, Accum>();
    for (const row of rows) {
      const resourceKey = fingerprintResource(row.resourceUrl);
      const key = `${row.issueCode}::${resourceKey}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, {
          issueCode: row.issueCode,
          resourceKey,
          severity: row.severity,
          category: row.category,
          message: row.message,
          count: 1,
        });
      }
    }

    await this.db.transaction(async (tx) => {
      for (const entry of byKey.values()) {
        await tx
          .insert(siteIssues)
          .values({
            // Drizzle emits a literal `default` keyword in INSERTs for any column
            // omitted from .values(), which Postgres rejects when the schema-side
            // default is a SQL expression (gen_random_uuid(), now(), etc.).
            // Pass every column explicitly to bypass.
            id: randomUUID(),
            siteId,
            issueCode: entry.issueCode,
            resourceKey: entry.resourceKey,
            severity: entry.severity,
            category: entry.category,
            message: entry.message,
            state: IssueState.OPEN,
            firstSeenAt: now,
            lastSeenAt: now,
            firstSeenAuditRunId: auditRunId,
            lastSeenAuditRunId: auditRunId,
            resolvedAt: null,
            ignoredAt: null,
            ignoredByUserId: null,
            occurrenceCount: entry.count,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [siteIssues.siteId, siteIssues.issueCode, siteIssues.resourceKey],
            set: {
              severity: entry.severity,
              category: entry.category,
              message: entry.message,
              lastSeenAt: now,
              lastSeenAuditRunId: auditRunId,
              occurrenceCount: entry.count,
              updatedAt: now,
              // Reopen if it was FIXED before; preserve IGNORED.
              // Cast literals to issue_state enum: drizzle 0.45.x sends them as
              // unknown text params and Postgres refuses to compare text =
              // issue_state inside a CASE expression.
              state: sql`CASE WHEN ${siteIssues.state} = ${stateLiteral(IssueState.IGNORED)} THEN ${stateLiteral(IssueState.IGNORED)} ELSE ${stateLiteral(IssueState.OPEN)} END`,
              resolvedAt: sql`CASE WHEN ${siteIssues.state} = ${stateLiteral(IssueState.IGNORED)} THEN ${siteIssues.resolvedAt} ELSE NULL END`,
            },
          });
      }

      // Close any OPEN issue that wasn't refreshed by this run. Resolved in
      // SQL — no need to load every OPEN issue into memory just to diff it.
      await tx
        .update(siteIssues)
        .set({ state: IssueState.FIXED, resolvedAt: now, updatedAt: now })
        .where(
          and(
            eq(siteIssues.siteId, siteId),
            eq(siteIssues.state, IssueState.OPEN),
            ne(siteIssues.lastSeenAuditRunId, auditRunId),
          ),
        );
    });
  }

  /**
   * Cross-site listing of persistent issues for a whole project. Joins `site_issues` with `sites`
   * so the project filter is one SQL roundtrip; optional `siteId`/`severity`/`category`/`state`
   * filters narrow the result. Permission is enforced at project level.
   */
  async listForProjectScope(
    projectId: string,
    userId: string,
    filters: {
      siteId?: string;
      severity?: Severity;
      category?: IssueCategory;
      state?: IssueState;
      pagination?: PaginationInput;
    },
  ) {
    await this.projectsService.assertPermission(projectId, userId, Permission.AUDIT_READ);

    const { limit, offset } = filters.pagination ?? { limit: 50, offset: 0 };

    const where = and(
      eq(sites.projectId, projectId),
      filters.siteId ? eq(siteIssues.siteId, filters.siteId) : undefined,
      filters.severity ? eq(siteIssues.severity, filters.severity) : undefined,
      filters.category ? eq(siteIssues.category, filters.category) : undefined,
      filters.state ? eq(siteIssues.state, filters.state) : undefined,
    );

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(siteIssues)
      .innerJoin(sites, eq(sites.id, siteIssues.siteId))
      .where(where);

    const rows = await this.db
      .select({
        issue: siteIssues,
        siteName: sites.name,
        siteDomain: sites.normalizedDomain,
      })
      .from(siteIssues)
      .innerJoin(sites, eq(sites.id, siteIssues.siteId))
      .where(where)
      .orderBy(desc(siteIssues.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      ...row.issue,
      siteName: row.siteName,
      siteDomain: row.siteDomain,
    }));

    return { items, total: Number(total ?? 0), limit, offset };
  }

  async listForProject(siteId: string, userId: string, filters?: { state?: IssueState }) {
    await this.sitesService.getById(siteId, userId);

    const whereClauses = [eq(siteIssues.siteId, siteId)];
    if (filters?.state) {
      whereClauses.push(eq(siteIssues.state, filters.state));
    }

    return this.db
      .select()
      .from(siteIssues)
      .where(and(...whereClauses))
      .orderBy(desc(siteIssues.lastSeenAt));
  }

  async getFingerprintsForAudit(siteId: string, auditRunId: string) {
    const rows = await this.db
      .select({
        issueCode: siteIssues.issueCode,
        resourceKey: siteIssues.resourceKey,
        state: siteIssues.state,
        firstSeenAt: siteIssues.firstSeenAt,
        lastSeenAt: siteIssues.lastSeenAt,
        firstSeenAuditRunId: siteIssues.firstSeenAuditRunId,
        id: siteIssues.id,
        occurrenceCount: siteIssues.occurrenceCount,
      })
      .from(siteIssues)
      .where(eq(siteIssues.siteId, siteId));

    // Not every fingerprint appears in the run — caller filters by key
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      byKey.set(`${row.issueCode}::${row.resourceKey}`, row);
    }
    void auditRunId;
    return byKey;
  }

  async getIgnoredFingerprints(siteId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ issueCode: siteIssues.issueCode, resourceKey: siteIssues.resourceKey })
      .from(siteIssues)
      .where(and(eq(siteIssues.siteId, siteId), eq(siteIssues.state, IssueState.IGNORED)));
    return new Set(rows.map((r) => `${r.issueCode}::${r.resourceKey}`));
  }

  static fingerprintResource(resourceUrl: string | null | undefined) {
    return fingerprintResource(resourceUrl);
  }

  async setState(projectIssueId: string, userId: string, nextState: IssueState) {
    const [record] = await this.db
      .select({ id: siteIssues.id, siteId: siteIssues.siteId })
      .from(siteIssues)
      .where(eq(siteIssues.id, projectIssueId))
      .limit(1);
    if (!record) {
      throw new NotFoundException('Issue no encontrado');
    }
    try {
      await this.sitesService.getByIdWithPermission(record.siteId, userId, Permission.ISSUE_UPDATE);
    } catch {
      throw new ForbiddenException('Sin acceso al proyecto');
    }

    const now = new Date();
    const patch: Record<string, unknown> = {
      state: nextState,
      updatedAt: now,
    };
    if (nextState === IssueState.IGNORED) {
      patch.ignoredAt = now;
      patch.ignoredByUserId = userId;
    }
    if (nextState === IssueState.OPEN) {
      patch.ignoredAt = null;
      patch.ignoredByUserId = null;
      patch.resolvedAt = null;
    }

    await this.db.update(siteIssues).set(patch).where(eq(siteIssues.id, projectIssueId));

    const [updated] = await this.db
      .select()
      .from(siteIssues)
      .where(eq(siteIssues.id, projectIssueId))
      .limit(1);

    if (updated) {
      // We need projectId for the activity event — fetch it from the site row.
      const [siteRow] = await this.db
        .select({ projectId: sites.projectId })
        .from(sites)
        .where(eq(sites.id, record.siteId))
        .limit(1);
      if (siteRow) {
        this.emitActivity({
          projectId: siteRow.projectId,
          userId,
          action:
            nextState === IssueState.IGNORED
              ? ActivityAction.ISSUE_IGNORED
              : ActivityAction.ISSUE_RESTORED,
          resourceType: 'issue',
          resourceId: updated.id,
          siteId: record.siteId,
          metadata: { issueCode: updated.issueCode, state: nextState },
        });
      }
    }
    return updated;
  }
}
