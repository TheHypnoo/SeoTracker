import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityAction,
  AuditStatus,
  type PaginatedResponse,
  Permission,
  ScheduleFrequency,
  Severity,
} from '@seotracker/shared-types';
import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';

import type { PaginationInput } from '../common/dto/pagination.dto';

import { assertPresent } from '../common/utils/assert';
import { normalizeDomain } from '../common/utils/domain';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  alertRules,
  auditIssues,
  auditRuns,
  siteSchedules,
  sites,
  projectMembers,
} from '../database/schema';
import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';
import { ProjectsService } from '../projects/projects.service';
import type { CreateSiteDto } from './dto/create-site.dto';
import type { UpdateSiteDto } from './dto/update-site.dto';
import type { UpsertScheduleDto } from './dto/upsert-schedule.dto';

export type EnrichedProject = typeof sites.$inferSelect & {
  latestAuditStatus: AuditStatus | null;
  latestAuditTrigger: string | null;
  latestAuditAt: Date | null;
  latestScore: number | null;
  latestAuditId: string | null;
  automationEnabled: boolean;
  criticalIssuesCount: number;
};

@Injectable()
export class SitesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async create(userId: string, input: CreateSiteDto) {
    await this.projectsService.assertPermission(input.projectId, userId, Permission.SITE_WRITE);

    const normalized = normalizeDomain(input.domain);

    const [site] = await this.db
      .insert(sites)
      .values({
        projectId: input.projectId,
        name: input.name.trim(),
        domain: input.domain.trim(),
        normalizedDomain: normalized.normalizedDomain,
        timezone: input.timezone,
        active: input.active ?? true,
      })
      .returning();

    const savedProject = assertPresent(site, 'Site creation did not return a row');

    await this.db
      .insert(alertRules)
      .values({
        siteId: savedProject.id,
      })
      .onConflictDoNothing();

    this.emitActivity({
      projectId: savedProject.projectId,
      userId,
      action: ActivityAction.SITE_CREATED,
      resourceType: 'site',
      resourceId: savedProject.id,
      siteId: savedProject.id,
      metadata: { name: savedProject.name, domain: savedProject.domain },
    });

    return savedProject;
  }

  async listByUser(userId: string) {
    return this.db
      .select({
        id: sites.id,
        projectId: sites.projectId,
        name: sites.name,
        domain: sites.domain,
        normalizedDomain: sites.normalizedDomain,
        timezone: sites.timezone,
        active: sites.active,
        createdAt: sites.createdAt,
      })
      .from(sites)
      .innerJoin(projectMembers, eq(projectMembers.projectId, sites.projectId))
      .where(eq(projectMembers.userId, userId))
      .orderBy(desc(sites.createdAt));
  }

  async listForProject(
    projectId: string,
    userId: string,
    filters: {
      search?: string | undefined;
      status?: string | undefined;
      automation?: 'active' | 'inactive' | undefined;
      pagination?: PaginationInput | undefined;
    } = {},
  ): Promise<PaginatedResponse<EnrichedProject>> {
    await this.projectsService.assertPermission(projectId, userId, Permission.SITE_READ);

    const { limit, offset } = filters.pagination ?? { limit: 50, offset: 0 };

    const search = filters.search?.trim();
    const searchLike = search ? `%${search}%` : null;

    const whereClauses = [eq(sites.projectId, projectId)];
    if (searchLike) {
      const searchCondition = or(
        ilike(sites.name, searchLike),
        ilike(sites.domain, searchLike),
        ilike(sites.normalizedDomain, searchLike),
      );
      if (searchCondition) {
        whereClauses.push(searchCondition);
      }
    }

    const filterCondition = whereClauses.length > 1 ? and(...whereClauses) : whereClauses[0];

    const [totalRow] = await this.db.select({ total: count() }).from(sites).where(filterCondition);

    const projectRows = await this.db
      .select()
      .from(sites)
      .where(filterCondition)
      .orderBy(desc(sites.createdAt))
      .limit(limit)
      .offset(offset);

    const siteIds = projectRows.map((site) => site.id);
    if (!siteIds.length) {
      return { items: [], total: Number(totalRow?.total ?? 0), limit, offset };
    }

    const [scheduleRows, latestRuns] = await Promise.all([
      this.db.select().from(siteSchedules).where(inArray(siteSchedules.siteId, siteIds)),
      this.loadLatestRunsByProject(siteIds),
    ]);

    const latestRunByProject = new Map(latestRuns.map((run) => [run.siteId, run]));
    const latestRunIds = latestRuns.map((run) => run.id);

    const criticalCounts = latestRunIds.length
      ? await this.db
          .select({
            auditRunId: auditIssues.auditRunId,
            total: count(),
          })
          .from(auditIssues)
          .where(
            and(
              inArray(auditIssues.auditRunId, latestRunIds),
              eq(auditIssues.severity, Severity.CRITICAL),
            ),
          )
          .groupBy(auditIssues.auditRunId)
      : [];

    const scheduleByProject = new Map(scheduleRows.map((schedule) => [schedule.siteId, schedule]));
    const criticalCountByRun = new Map(
      criticalCounts.map((item) => [item.auditRunId, Number(item.total)]),
    );

    const enriched = projectRows.map((site) => {
      const latestRun = latestRunByProject.get(site.id) ?? null;
      const schedule = scheduleByProject.get(site.id) ?? null;

      return {
        ...site,
        latestAuditStatus: latestRun?.status ?? null,
        latestAuditTrigger: latestRun?.trigger ?? null,
        latestAuditAt: latestRun?.createdAt ?? null,
        latestScore: latestRun?.score ?? null,
        latestAuditId: latestRun?.id ?? null,
        automationEnabled: schedule?.enabled ?? false,
        criticalIssuesCount: latestRun ? (criticalCountByRun.get(latestRun.id) ?? 0) : 0,
      } satisfies EnrichedProject;
    });

    const filtered = enriched.filter((site) => {
      if (filters.status && site.latestAuditStatus !== (filters.status as AuditStatus)) {
        return false;
      }

      if (filters.automation === 'active' && !site.automationEnabled) {
        return false;
      }

      if (filters.automation === 'inactive' && site.automationEnabled) {
        return false;
      }

      return true;
    });

    return {
      items: filtered,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset,
    };
  }

  private async loadLatestRunsByProject(siteIds: string[]) {
    if (!siteIds.length) {
      return [];
    }

    return this.db
      .selectDistinctOn([auditRuns.siteId])
      .from(auditRuns)
      .where(inArray(auditRuns.siteId, siteIds))
      .orderBy(auditRuns.siteId, desc(auditRuns.createdAt));
  }

  async getById(siteId: string, userId: string) {
    return this.getByIdWithPermission(siteId, userId, Permission.SITE_READ);
  }

  /**
   * Internal helper used by services that need to load a site AND assert a
   * specific permission against the project. The default `getById` uses
   * SITE_READ — anyone with view-level access. Mutating endpoints upgrade to
   * SITE_WRITE / SITE_DELETE / AUDIT_RUN / etc.
   */
  async getByIdWithPermission(siteId: string, userId: string, permission: Permission) {
    const [site] = await this.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    await this.projectsService.assertPermission(site.projectId, userId, permission);

    return site;
  }

  async update(siteId: string, userId: string, input: UpdateSiteDto) {
    const site = await this.getByIdWithPermission(siteId, userId, Permission.SITE_WRITE);

    const updates: Partial<typeof sites.$inferInsert> = {};

    if (input.name) {
      updates.name = input.name.trim();
    }

    if (input.domain) {
      const normalized = normalizeDomain(input.domain);
      updates.domain = input.domain.trim();
      updates.normalizedDomain = normalized.normalizedDomain;
    }

    if (input.timezone) {
      updates.timezone = input.timezone;
    }

    if (typeof input.active === 'boolean') {
      updates.active = input.active;
    }

    updates.updatedAt = new Date();

    const [updated] = await this.db
      .update(sites)
      .set(updates)
      .where(eq(sites.id, site.id))
      .returning();

    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.SITE_UPDATED,
      resourceType: 'site',
      resourceId: site.id,
      siteId: site.id,
      metadata: { changes: Object.keys(updates) },
    });

    return updated;
  }

  async delete(siteId: string, userId: string) {
    const site = await this.getByIdWithPermission(siteId, userId, Permission.SITE_DELETE);
    await this.db.delete(sites).where(eq(sites.id, site.id));
    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.SITE_DELETED,
      resourceType: 'site',
      resourceId: site.id,
      siteId: null,
      metadata: { name: site.name, domain: site.domain },
    });
    return { success: true };
  }

  async upsertSchedule(siteId: string, userId: string, input: UpsertScheduleDto) {
    const site = await this.getByIdWithPermission(siteId, userId, Permission.SCHEDULE_WRITE);

    if (input.frequency === ScheduleFrequency.WEEKLY && typeof input.dayOfWeek !== 'number') {
      throw new BadRequestException('dayOfWeek is required for WEEKLY schedules');
    }

    const [saved] = await this.db
      .insert(siteSchedules)
      .values({
        siteId: site.id,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        timeOfDay: input.timeOfDay,
        timezone: input.timezone,
        enabled: input.enabled ?? true,
      })
      .onConflictDoUpdate({
        target: siteSchedules.siteId,
        set: {
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek ?? null,
          timeOfDay: input.timeOfDay,
          timezone: input.timezone,
          enabled: input.enabled ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();

    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.SCHEDULE_UPDATED,
      resourceType: 'schedule',
      resourceId: site.id,
      siteId: site.id,
      metadata: { frequency: input.frequency, enabled: input.enabled ?? true },
    });

    return saved;
  }

  async getSchedule(siteId: string, userId: string) {
    const site = await this.getByIdWithPermission(siteId, userId, Permission.SCHEDULE_READ);

    const [schedule] = await this.db
      .select()
      .from(siteSchedules)
      .where(eq(siteSchedules.siteId, site.id))
      .limit(1);
    return schedule ?? null;
  }
}
