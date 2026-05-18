import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAction, Permission } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { sites } from '../database/schema';
import { PublicBadgesService } from '../public-badges/public-badges.service';
import { SitesService } from './sites.service';

/**
 * Authenticated admin surface for the public-badge opt-in. Toggling the
 * flag here invalidates the cached SVG so the next public request reflects
 * the new state immediately.
 */
@Injectable()
export class PublicBadgeAdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
    private readonly publicBadgesService: PublicBadgesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async getForUser(siteId: string, userId: string): Promise<{ enabled: boolean }> {
    const site = await this.sitesService.getByIdWithPermission(
      siteId,
      userId,
      Permission.SCHEDULE_READ,
    );
    return { enabled: site.publicBadgeEnabled };
  }

  async update(
    siteId: string,
    userId: string,
    input: { enabled: boolean },
  ): Promise<{ enabled: boolean }> {
    const site = await this.sitesService.getByIdWithPermission(
      siteId,
      userId,
      Permission.SCHEDULE_WRITE,
    );

    await this.db
      .update(sites)
      .set({ publicBadgeEnabled: input.enabled, updatedAt: new Date() })
      .where(eq(sites.id, siteId));

    await this.publicBadgesService.invalidate(siteId);

    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.PUBLIC_BADGE_TOGGLED,
      resourceType: 'public_badge',
      resourceId: siteId,
      siteId,
      metadata: { enabled: input.enabled },
    });

    return { enabled: input.enabled };
  }
}
