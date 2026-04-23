import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAction, Permission } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { siteCrawlConfigs } from '../database/schema';
import { SitesService } from './sites.service';

/**
 * The shape of crawl config exposed to the SEO engine. All fields are
 * concrete numbers — no `null` — because the service merges per-site
 * overrides with global defaults before returning.
 */
export type ResolvedCrawlConfig = {
  maxPages: number;
  maxDepth: number;
  maxConcurrentPages: number;
  requestDelayMs: number;
  respectCrawlDelay: boolean;
  userAgent: string | null;
};

export type CrawlConfigInput = {
  maxPages?: number;
  maxDepth?: number;
  maxConcurrentPages?: number;
  requestDelayMs?: number;
  respectCrawlDelay?: boolean;
  userAgent?: string | null;
};

const HARD_CAP = {
  /** Defensive max — operators can configure but never exceed. */
  maxPages: 500,
  maxDepth: 5,
  maxConcurrentPages: 20,
  requestDelayMs: 5_000,
};

@Injectable()
export class CrawlConfigService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly sitesService: SitesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  /**
   * Resolve the effective crawl config for a site: per-site row overrides
   * fall on top of the global env-config defaults. Used by the audit
   * processor before each run so changes take effect on the next audit.
   */
  async resolve(siteId: string): Promise<ResolvedCrawlConfig> {
    const [row] = await this.db
      .select()
      .from(siteCrawlConfigs)
      .where(eq(siteCrawlConfigs.siteId, siteId))
      .limit(1);

    const defaults = {
      maxPages: this.configService.get('AUDIT_MAX_PAGES', { infer: true }),
      maxDepth: this.configService.get('AUDIT_MAX_DEPTH', { infer: true }),
      maxConcurrentPages: 5,
      requestDelayMs: 0,
      respectCrawlDelay: true,
      userAgent: null as string | null,
    };

    if (!row) return defaults;

    return {
      maxPages: row.maxPages ?? defaults.maxPages,
      maxDepth: row.maxDepth ?? defaults.maxDepth,
      maxConcurrentPages: row.maxConcurrentPages ?? defaults.maxConcurrentPages,
      requestDelayMs: row.requestDelayMs ?? defaults.requestDelayMs,
      respectCrawlDelay: row.respectCrawlDelay ?? defaults.respectCrawlDelay,
      userAgent: row.userAgent ?? defaults.userAgent,
    };
  }

  async getForUser(siteId: string, userId: string): Promise<ResolvedCrawlConfig> {
    await this.sitesService.getByIdWithPermission(siteId, userId, Permission.SCHEDULE_READ);
    return this.resolve(siteId);
  }

  /**
   * Upsert a crawl config row for a site. Validates against hard caps so
   * misconfigured rows can't hang the worker.
   */
  async update(siteId: string, userId: string, input: CrawlConfigInput) {
    const site = await this.sitesService.getByIdWithPermission(
      siteId,
      userId,
      Permission.SCHEDULE_WRITE,
    );

    this.validate(input);

    const patch = {
      ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
      ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}),
      ...(input.maxConcurrentPages !== undefined
        ? { maxConcurrentPages: input.maxConcurrentPages }
        : {}),
      ...(input.requestDelayMs !== undefined ? { requestDelayMs: input.requestDelayMs } : {}),
      ...(input.respectCrawlDelay !== undefined
        ? { respectCrawlDelay: input.respectCrawlDelay }
        : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      updatedAt: new Date(),
    };

    await this.db
      .insert(siteCrawlConfigs)
      .values({ siteId, ...patch })
      .onConflictDoUpdate({ target: siteCrawlConfigs.siteId, set: patch });

    this.emitActivity({
      projectId: site.projectId,
      userId,
      action: ActivityAction.CRAWL_CONFIG_UPDATED,
      resourceType: 'crawl_config',
      resourceId: siteId,
      siteId,
      metadata: { changes: Object.keys(patch).filter((k) => k !== 'updatedAt') },
    });

    return this.resolve(siteId);
  }

  private validate(input: CrawlConfigInput) {
    const numeric: Array<[keyof typeof HARD_CAP, number | undefined]> = [
      ['maxPages', input.maxPages],
      ['maxDepth', input.maxDepth],
      ['maxConcurrentPages', input.maxConcurrentPages],
      ['requestDelayMs', input.requestDelayMs],
    ];
    for (const [key, value] of numeric) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0 || value > HARD_CAP[key]) {
        throw new Error(`${key} must be an integer in [0, ${HARD_CAP[key]}]`);
      }
    }
  }
}
