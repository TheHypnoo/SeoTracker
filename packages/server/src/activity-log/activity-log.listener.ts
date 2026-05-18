import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityAction, type Role } from '@seotracker/shared-types';

import { ActivityLogService } from './activity-log.service';

/**
 * Generic activity event payload. Services emit one of these via EventEmitter2
 * (`activity.recorded`) after each successful mutation. The listener resolves
 * the actor's role snapshot and writes a row.
 *
 * Using events instead of direct service calls keeps the activity-log module
 * one-way coupled — every service in the system can emit without importing
 * ActivityLogModule, breaking circular-dependency risk between modules.
 */
export type ActivityEvent = {
  projectId: string;
  userId: string | null;
  action: ActivityAction;
  resourceType?: string | null;
  resourceId?: string | null;
  siteId?: string | null;
  metadata?: Record<string, unknown>;
  /** Pre-computed role snapshot. If undefined, the listener computes it. */
  role?: Role | null;
};

export const ACTIVITY_RECORDED_EVENT = 'activity.recorded' as const;

@Injectable()
export class ActivityLogListener {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @OnEvent(ACTIVITY_RECORDED_EVENT)
  async handle(event: ActivityEvent): Promise<void> {
    const role =
      event.role !== undefined
        ? event.role
        : await this.activityLogService.snapshotRole(event.projectId, event.userId);

    await this.activityLogService.record({
      projectId: event.projectId,
      userId: event.userId,
      role,
      action: event.action,
      resourceType: event.resourceType ?? null,
      resourceId: event.resourceId ?? null,
      siteId: event.siteId ?? null,
      metadata: event.metadata ?? {},
    });
  }
}
