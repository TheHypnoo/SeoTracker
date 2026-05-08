import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityAction,
  AuditStatus,
  computeEffectivePermissions,
  GRANTABLE_PERMISSIONS,
  OWNER_EXCLUSIVE_PERMISSIONS,
  Permission,
  Role,
  ROLE_PERMISSIONS,
  Severity,
} from '@seotracker/shared-types';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';

import { assertPresent } from '../common/utils/assert';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditComparisons,
  auditIssues,
  auditRuns,
  siteSchedules,
  sites,
  users,
  projectInvites,
  projectMembers,
  projects,
} from '../database/schema';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async createProject(ownerUserId: string, name: string) {
    const [project] = await this.db
      .insert(projects)
      .values({
        name: name.trim(),
        ownerUserId,
      })
      .returning();

    const savedProject = assertPresent(project, 'Project creation did not return a row');

    // Drizzle 1.0 (beta + rc) emits a literal `default` keyword in INSERTs for
    // any column whose value is omitted, which Postgres rejects when the
    // default is a SQL expression. Pass every column explicitly to bypass.
    await this.db.insert(projectMembers).values({
      projectId: savedProject.id,
      userId: ownerUserId,
      role: Role.OWNER,
      extraPermissions: [],
      revokedPermissions: [],
      createdAt: new Date(),
    });

    this.emitActivity({
      projectId: savedProject.id,
      userId: ownerUserId,
      role: Role.OWNER,
      action: ActivityAction.PROJECT_CREATED,
      resourceType: 'project',
      resourceId: savedProject.id,
      metadata: { name: savedProject.name },
    });

    return savedProject;
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        id: projects.id,
        name: projects.name,
        ownerUserId: projects.ownerUserId,
        createdAt: projects.createdAt,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, userId));
  }

  async getProjectForUser(projectId: string, userId: string) {
    const [project] = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        ownerUserId: projects.ownerUserId,
        createdAt: projects.createdAt,
        role: projectMembers.role,
        extraPermissions: projectMembers.extraPermissions,
        revokedPermissions: projectMembers.revokedPermissions,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projects.id, projectId), eq(projectMembers.userId, userId)))
      .limit(1);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const effectivePermissionSet = computeEffectivePermissions(
      project.role as Role,
      (project.extraPermissions ?? []) as Permission[],
      (project.revokedPermissions ?? []) as Permission[],
    );
    if (!effectivePermissionSet.has(Permission.PROJECT_VIEW)) {
      throw new ForbiddenException(`Missing permission: ${Permission.PROJECT_VIEW}`);
    }

    return {
      id: project.id,
      name: project.name,
      ownerUserId: project.ownerUserId,
      createdAt: project.createdAt,
      role: project.role,
      effectivePermissions: Array.from(effectivePermissionSet),
    };
  }

  async updateProject(projectId: string, userId: string, input: { name?: string }) {
    await this.assertOwner(projectId, userId);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Project name is required');
    }

    const [updated] = await this.db
      .update(projects)
      .set({ name })
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Project not found');
    }

    this.emitActivity({
      projectId,
      userId,
      action: ActivityAction.PROJECT_UPDATED,
      resourceType: 'project',
      resourceId: projectId,
      metadata: { name },
    });

    return updated;
  }

  async deleteProject(projectId: string, userId: string) {
    await this.assertPermission(projectId, userId, Permission.PROJECT_DELETE);

    await this.db.delete(projects).where(eq(projects.id, projectId));

    return { success: true };
  }

  async getDashboard(projectId: string, userId: string) {
    const project = await this.getProjectForUser(projectId, userId);
    const projectRows = await this.db
      .select()
      .from(sites)
      .where(eq(sites.projectId, projectId))
      .orderBy(desc(sites.createdAt));
    const siteIds = projectRows.map((site) => site.id);
    const projectById = new Map(projectRows.map((site) => [site.id, site]));

    if (!siteIds.length) {
      return {
        project,
        summary: {
          activeProjects: 0,
          totalAudits: 0,
          averageScore: null,
          criticalIssues: 0,
          regressions: 0,
          activeAutomations: 0,
        },
        trend: [],
        recentProjects: [],
        recentAudits: [],
        activity: [],
      };
    }

    const trendWindowDays = 30;
    const trendSince = new Date(Date.now() - trendWindowDays * 24 * 60 * 60 * 1000);

    const [
      scheduleAggregate,
      totalAuditsRow,
      latestCompletedRuns,
      recentRuns,
      trendRows,
      regressionCountRow,
      comparisonRows,
      inviteRows,
    ] = await Promise.all([
      this.db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${siteSchedules.enabled} = true)`,
        })
        .from(siteSchedules)
        .where(inArray(siteSchedules.siteId, siteIds)),
      this.db.select({ total: count() }).from(auditRuns).where(inArray(auditRuns.siteId, siteIds)),
      this.db
        .selectDistinctOn([auditRuns.siteId])
        .from(auditRuns)
        .where(and(inArray(auditRuns.siteId, siteIds), eq(auditRuns.status, AuditStatus.COMPLETED)))
        .orderBy(auditRuns.siteId, desc(auditRuns.createdAt)),
      this.db
        .select()
        .from(auditRuns)
        .where(inArray(auditRuns.siteId, siteIds))
        .orderBy(desc(auditRuns.createdAt))
        .limit(6),
      this.db
        .select({
          createdAt: auditRuns.createdAt,
          finishedAt: auditRuns.finishedAt,
          score: auditRuns.score,
          siteId: auditRuns.siteId,
        })
        .from(auditRuns)
        .where(
          and(
            inArray(auditRuns.siteId, siteIds),
            eq(auditRuns.status, AuditStatus.COMPLETED),
            gte(auditRuns.createdAt, trendSince),
            sql`${auditRuns.score} is not null`,
          ),
        )
        .orderBy(auditRuns.createdAt),
      this.db
        .select({
          total: sql<number>`count(*) filter (where ${auditComparisons.regressionsCount} > 0)`,
        })
        .from(auditComparisons)
        .where(inArray(auditComparisons.siteId, siteIds)),
      this.db
        .select()
        .from(auditComparisons)
        .where(
          and(
            inArray(auditComparisons.siteId, siteIds),
            sql`${auditComparisons.regressionsCount} > 0`,
          ),
        )
        .orderBy(desc(auditComparisons.createdAt))
        .limit(4),
      this.db
        .select()
        .from(projectInvites)
        .where(eq(projectInvites.projectId, projectId))
        .orderBy(desc(projectInvites.createdAt))
        .limit(5),
    ]);

    const latestCompletedByProject = new Map(latestCompletedRuns.map((run) => [run.siteId, run]));
    const latestCompletedIds = latestCompletedRuns.map((run) => run.id);
    const recentAuditIds = recentRuns.map((run) => run.id);

    const [criticalByRun, issuesByRun] = await Promise.all([
      latestCompletedIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(
              and(
                inArray(auditIssues.auditRunId, latestCompletedIds),
                eq(auditIssues.severity, Severity.CRITICAL),
              ),
            )
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
      recentAuditIds.length
        ? this.db
            .select({ auditRunId: auditIssues.auditRunId, total: count() })
            .from(auditIssues)
            .where(inArray(auditIssues.auditRunId, recentAuditIds))
            .groupBy(auditIssues.auditRunId)
        : Promise.resolve([]),
    ]);

    const criticalByRunMap = new Map(
      criticalByRun.map((row) => [row.auditRunId, Number(row.total)]),
    );
    const issuesByRunMap = new Map(issuesByRun.map((row) => [row.auditRunId, Number(row.total)]));

    const recentProjects = projectRows.slice(0, 4).map((site) => {
      const latestCompletedRun = latestCompletedByProject.get(site.id) ?? null;
      return {
        id: site.id,
        name: site.name,
        domain: site.domain,
        latestScore: latestCompletedRun?.score ?? null,
        latestAuditAt: latestCompletedRun?.createdAt ?? null,
      };
    });

    const recentAudits = recentRuns.map((run) => {
      const site = projectById.get(run.siteId);
      return {
        ...run,
        projectName: site?.name ?? 'Proyecto',
        issuesCount: issuesByRunMap.get(run.id) ?? 0,
      };
    });

    const activity = [
      ...recentAudits.map((run) => ({
        kind: run.status === AuditStatus.FAILED ? 'AUDIT_FAILED' : 'AUDIT',
        title: run.status === AuditStatus.FAILED ? 'Auditoría fallida' : 'Auditoría actualizada',
        body: `${run.projectName} · ${run.status}`,
        createdAt: run.createdAt,
      })),
      ...comparisonRows.map((comparison) => {
        const site = projectById.get(comparison.siteId);
        return {
          kind: 'REGRESSION',
          title: 'Regresión detectada',
          body: `${site?.domain ?? site?.name ?? 'Proyecto'} · ${comparison.regressionsCount} regresiones`,
          createdAt: comparison.createdAt,
        };
      }),
      ...inviteRows.map((invite) => ({
        kind: 'INVITE',
        title: 'Nuevo usuario invitado',
        body: invite.email,
        createdAt: invite.createdAt,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 6);

    const trend = trendRows.flatMap((row) => {
      if (row.score === null) return [];
      const site = projectById.get(row.siteId);
      return [
        {
          date: (row.finishedAt ?? row.createdAt).toISOString(),
          score: row.score,
          siteDomain: site?.domain ?? '',
          siteId: row.siteId,
          siteName: site?.name ?? site?.domain ?? 'Dominio',
        },
      ];
    });

    const latestScores = latestCompletedRuns
      .map((run) => run.score)
      .filter((score): score is number => typeof score === 'number');

    const criticalIssues = latestCompletedIds.reduce(
      (sum, runId) => sum + (criticalByRunMap.get(runId) ?? 0),
      0,
    );

    return {
      project,
      summary: {
        activeProjects: projectRows.filter((site) => site.active).length,
        totalAudits: Number(totalAuditsRow[0]?.total ?? 0),
        averageScore: latestScores.length
          ? Math.round(latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length)
          : null,
        criticalIssues,
        regressions: Number(regressionCountRow[0]?.total ?? 0),
        activeAutomations: Number(scheduleAggregate[0]?.active ?? 0),
      },
      trend,
      recentProjects,
      recentAudits,
      activity,
    };
  }

  async listMembers(projectId: string, userId: string) {
    await this.assertPermission(projectId, userId, Permission.MEMBERS_READ);

    const rows = await this.db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        extraPermissions: projectMembers.extraPermissions,
        revokedPermissions: projectMembers.revokedPermissions,
        createdAt: projectMembers.createdAt,
        email: users.email,
        name: users.name,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));

    return rows.map((row) => ({
      ...row,
      extraPermissions: (row.extraPermissions ?? []) as Permission[],
      revokedPermissions: (row.revokedPermissions ?? []) as Permission[],
      effectivePermissions: Array.from(
        computeEffectivePermissions(
          row.role as Role,
          (row.extraPermissions ?? []) as Permission[],
          (row.revokedPermissions ?? []) as Permission[],
        ),
      ),
    }));
  }

  async removeMember(projectId: string, targetUserId: string, actorUserId: string) {
    await this.assertPermission(projectId, actorUserId, Permission.MEMBERS_REMOVE);

    if (targetUserId === actorUserId) {
      throw new ForbiddenException('Cannot remove self');
    }

    const target = await this.getMembership(projectId, targetUserId);
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    if (target.role === Role.OWNER) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    await this.db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUserId)));

    this.emitActivity({
      projectId,
      userId: actorUserId,
      action: ActivityAction.MEMBER_REMOVED,
      resourceType: 'member',
      resourceId: targetUserId,
      metadata: { targetUserId },
    });

    return { success: true };
  }

  /**
   * Update the role and/or override permissions for an existing member.
   *
   * - Only OWNER (or someone with MEMBERS_INVITE — which is owner-exclusive
   *   today) can call this.
   * - OWNER cannot have its role/perms touched here; promote/demote via a
   *   dedicated transfer-ownership flow if ever needed.
   * - When the role changes, overrides reset to [] so the caller can re-apply
   *   on top of the new role's defaults — predictable, no surprises.
   * - extraPermissions cannot include OWNER_EXCLUSIVE permissions.
   * - revokedPermissions can only contain perms the role grants by default.
   */
  async updateMemberPermissions(
    projectId: string,
    targetUserId: string,
    actorUserId: string,
    input: {
      role?: Role;
      extraPermissions?: Permission[];
      revokedPermissions?: Permission[];
    },
  ) {
    await this.assertPermission(projectId, actorUserId, Permission.MEMBERS_INVITE);

    const target = await this.getMembership(projectId, targetUserId);
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    if (target.role === Role.OWNER) {
      throw new ForbiddenException('Cannot modify the owner');
    }

    const newRole = input.role ?? target.role;
    if (newRole === Role.OWNER) {
      throw new BadRequestException('Cannot promote to OWNER via this endpoint');
    }

    const isRoleChange = input.role !== undefined && input.role !== target.role;
    // Role change resets overrides — force callers to re-apply on top of new defaults.
    const baseExtras = isRoleChange ? [] : (input.extraPermissions ?? []);
    const baseRevoked = isRoleChange ? [] : (input.revokedPermissions ?? []);

    this.validateOverrides(newRole as Role, baseExtras, baseRevoked);

    await this.db
      .update(projectMembers)
      .set({
        role: newRole as Role,
        extraPermissions: baseExtras,
        revokedPermissions: baseRevoked,
      })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUserId)));

    this.emitActivity({
      projectId,
      userId: actorUserId,
      action: ActivityAction.MEMBER_PERMS_UPDATED,
      resourceType: 'member',
      resourceId: targetUserId,
      metadata: {
        targetUserId,
        previousRole: target.role,
        newRole,
        roleChanged: isRoleChange,
        extraPermissions: baseExtras,
        revokedPermissions: baseRevoked,
      },
    });

    return this.getMembership(projectId, targetUserId);
  }

  /**
   * Validates that `extras` only contains grantable perms and `revoked`
   * only contains perms the role grants by default. Throws BadRequestException
   * with a precise reason on the first violation.
   */
  validateOverrides(role: Role, extras: Permission[], revoked: Permission[]) {
    if (role === Role.OWNER) {
      if (extras.length > 0 || revoked.length > 0) {
        throw new BadRequestException('OWNER cannot have permission overrides');
      }
      return;
    }
    for (const p of extras) {
      if (OWNER_EXCLUSIVE_PERMISSIONS.has(p)) {
        throw new BadRequestException(
          `Permission "${p}" is owner-exclusive and cannot be granted to ${role}`,
        );
      }
      if (!GRANTABLE_PERMISSIONS.has(p)) {
        throw new BadRequestException(`Unknown permission "${p}"`);
      }
    }
    const defaults = ROLE_PERMISSIONS[role];
    for (const p of revoked) {
      if (!defaults.has(p)) {
        throw new BadRequestException(
          `Permission "${p}" is not in the default set for ${role}; cannot revoke`,
        );
      }
    }
  }

  async assertMember(projectId: string, userId: string) {
    const membership = await this.getMembership(projectId, userId);
    if (!membership) {
      throw new ForbiddenException('Not a project member');
    }
    return membership;
  }

  /** @deprecated use `assertPermission(projectId, userId, perm)` instead. */
  async assertOwner(projectId: string, userId: string) {
    const membership = await this.getMembership(projectId, userId);
    if (!membership || membership.role !== Role.OWNER) {
      throw new ForbiddenException('Only owner can perform this action');
    }
    return membership;
  }

  /**
   * Compute the user's effective permission set on this project, applying the
   * per-member overrides on top of the role defaults. Returns null if the user
   * is not a member.
   */
  async getEffectivePermissions(
    projectId: string,
    userId: string,
  ): Promise<Set<Permission> | null> {
    const membership = await this.getMembership(projectId, userId);
    if (!membership) return null;
    return computeEffectivePermissions(
      membership.role as Role,
      (membership.extraPermissions ?? []) as Permission[],
      (membership.revokedPermissions ?? []) as Permission[],
    );
  }

  /**
   * Throws ForbiddenException unless the user has the given permission on the
   * project. The single source of truth for authz throughout the API.
   */
  async assertPermission(projectId: string, userId: string, permission: Permission) {
    const perms = await this.getEffectivePermissions(projectId, userId);
    if (!perms) {
      throw new ForbiddenException('Not a project member');
    }
    if (!perms.has(permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  getMembership(projectId: string, userId: string) {
    return this.db
      .select({
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        role: projectMembers.role,
        extraPermissions: projectMembers.extraPermissions,
        revokedPermissions: projectMembers.revokedPermissions,
      })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1)
      .then((rows) => rows[0]);
  }

  async addMember(
    projectId: string,
    userId: string,
    role: Role,
    extraPermissions: Permission[] = [],
    revokedPermissions: Permission[] = [],
  ) {
    if (role === Role.OWNER) {
      throw new BadRequestException('Cannot add OWNER through membership flows');
    }
    this.validateOverrides(role, extraPermissions, revokedPermissions);
    await this.db
      .insert(projectMembers)
      .values({
        projectId,
        userId,
        role,
        extraPermissions,
        revokedPermissions,
      })
      .onConflictDoNothing();

    return this.getMembership(projectId, userId);
  }
}
