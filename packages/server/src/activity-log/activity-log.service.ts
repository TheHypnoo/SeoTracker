import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActivityAction, type Role } from '@seotracker/shared-types';
import { and, desc, eq, lt } from 'drizzle-orm';

import type { PaginationInput } from '../common/dto/pagination.dto';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { activityLog, projectMembers, users } from '../database/schema';

export type RecordActivityInput = {
  projectId: string;
  userId: string | null;
  /** Snapshot of the actor's role at action time. Captured so the timeline
   *  doesn't surprise viewers later if the role gets demoted. */
  role: Role | null;
  action: ActivityAction;
  resourceType?: string | null;
  resourceId?: string | null;
  siteId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Persist a single activity event. Best-effort: failures are logged but never
   * thrown so the calling business path doesn't fail because of audit writes.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.db.insert(activityLog).values({
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        siteId: input.siteId ?? null,
        metadata: (input.metadata ?? {}) as never,
      });
    } catch (error) {
      this.logger.error(`Failed to record activity ${input.action}: ${String(error)}`);
    }
  }

  /**
   * List recent activity for a project. Supports cursor pagination via
   * `before` (createdAt) so the UI can lazy-load older entries without
   * tiebreaker drama. Joins users so the timeline can render the actor's
   * email/name without a second roundtrip.
   */
  async listForProject(
    projectId: string,
    options: { pagination?: PaginationInput; before?: Date | undefined } = {},
  ) {
    const limit = Math.min(options.pagination?.limit ?? 50, 200);

    const whereClauses = [eq(activityLog.projectId, projectId)];
    if (options.before) whereClauses.push(lt(activityLog.createdAt, options.before));
    const whereCondition = whereClauses.length > 1 ? and(...whereClauses) : whereClauses[0];

    const rows = await this.db
      .select({
        id: activityLog.id,
        projectId: activityLog.projectId,
        siteId: activityLog.siteId,
        userId: activityLog.userId,
        role: activityLog.role,
        action: activityLog.action,
        resourceType: activityLog.resourceType,
        resourceId: activityLog.resourceId,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
        userEmail: users.email,
        userName: users.name,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .where(whereCondition)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    return rows;
  }

  /**
   * Capture the actor's role at the time of the action. Returns null when the
   * user is no longer (or never was) a member — the action is still recorded
   * for traceability, but role is left null so consumers can render it as
   * "(former member)".
   */
  async snapshotRole(projectId: string, userId: string | null): Promise<Role | null> {
    if (!userId) return null;
    const [row] = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return (row?.role as Role | undefined) ?? null;
  }
}
