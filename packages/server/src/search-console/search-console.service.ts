import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@seotracker/shared-types';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  gscDailyStats,
  searchConsoleProperties,
  sites,
  siteSearchConsoleLinks,
} from '../database/schema';
import { GoogleOauthService } from '../google/google-oauth.service';
import { ProjectsService } from '../projects/projects.service';
import { QueueService } from '../queue/queue.service';
import { SEARCH_CONSOLE_UNVERIFIED_PERMISSION } from './search-console.constants';
import {
  type SearchAnalyticsRow,
  type SearchConsoleDimension,
  type SearchConsoleDimensionFilterGroup,
  SearchConsoleClient,
} from './search-console.client';

const DEFAULT_IMPORT_DIMENSIONS: SearchConsoleDimension[][] = [
  ['date'],
  ['date', 'query'],
  ['date', 'page'],
  ['date', 'country'],
  ['date', 'device'],
  // query+page rows (per date) power keyword cannibalization detection: which URLs
  // compete for the same query. They never carry a country/device so they are excluded
  // from the single-dimension aggregates above.
  ['date', 'query', 'page'],
];

// searchAnalytics.query returns at most 25k rows per request; paginate beyond that.
const SEARCH_CONSOLE_ROW_LIMIT = 25_000;
// Batch size for idempotent upserts so a backfill does not issue one round-trip per row.
const GSC_UPSERT_CHUNK_SIZE = 500;

// Striking-distance tuning. Queries need a floor of impressions to be worth surfacing; the target
// CTR approximates a strong page-one result and drives the "potential clicks" estimate. The
// candidate cap bounds the rows scored in memory before returning the requested limit.
const OPPORTUNITY_MIN_IMPRESSIONS = 20;
const OPPORTUNITY_TARGET_CTR = 0.1;
const OPPORTUNITY_CANDIDATE_CAP = 200;

// Cannibalization: a competing URL must clear this impression floor to count, and we scan up to
// this many query+page rows before grouping by query in memory.
const CANNIBALIZATION_MIN_IMPRESSIONS = 10;
const CANNIBALIZATION_ROW_CAP = 2_000;

@Injectable()
export class SearchConsoleService {
  private readonly logger = new Logger(SearchConsoleService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
    private readonly googleOauthService: GoogleOauthService,
    private readonly searchConsoleClient: SearchConsoleClient,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async syncProperties(projectId: string, userId: string, googleConnectionId: string) {
    await this.projectsService.assertPermission(projectId, userId, Permission.OUTBOUND_WRITE);
    const { accessToken } = await this.googleOauthService.getValidAccessToken(
      projectId,
      googleConnectionId,
    );
    const entries = await this.searchConsoleClient.listSites(accessToken);
    const now = new Date();

    const properties = await Promise.all(
      entries.map((entry) =>
        this.upsertProperty({
          googleConnectionId,
          lastSyncedAt: now,
          permissionLevel: entry.permissionLevel,
          projectId,
          siteUrl: entry.siteUrl,
          verified: entry.permissionLevel !== SEARCH_CONSOLE_UNVERIFIED_PERMISSION,
        }),
      ),
    );

    return {
      count: properties.length,
      properties: properties.map((property) => this.toResponse(property)),
    };
  }

  async listProperties(projectId: string, userId: string) {
    await this.projectsService.assertPermission(projectId, userId, Permission.OUTBOUND_READ);
    const rows = await this.db
      .select()
      .from(searchConsoleProperties)
      .where(eq(searchConsoleProperties.projectId, projectId))
      .orderBy(asc(searchConsoleProperties.siteUrl));
    return rows.map((row) => this.toResponse(row));
  }

  async getLinkedProperty(siteId: string, userId: string) {
    const site = await this.getSiteWithPermission(siteId, userId, Permission.SITE_READ);
    const [row] = await this.db
      .select({
        link: siteSearchConsoleLinks,
        property: searchConsoleProperties,
      })
      .from(siteSearchConsoleLinks)
      .innerJoin(
        searchConsoleProperties,
        eq(siteSearchConsoleLinks.searchConsolePropertyId, searchConsoleProperties.id),
      )
      .where(
        and(eq(siteSearchConsoleLinks.siteId, site.id), eq(siteSearchConsoleLinks.active, true)),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      active: row.link.active,
      linkedAt: row.link.linkedAt,
      linkedByUserId: row.link.linkedByUserId,
      property: this.toResponse(row.property),
      siteId: row.link.siteId,
      updatedAt: row.link.updatedAt,
    };
  }

  async listCandidates(siteId: string, userId: string) {
    const site = await this.getSiteWithPermission(siteId, userId, Permission.SITE_READ);
    const rows = await this.db
      .select()
      .from(searchConsoleProperties)
      .where(eq(searchConsoleProperties.projectId, site.projectId))
      .orderBy(desc(searchConsoleProperties.lastSyncedAt), asc(searchConsoleProperties.siteUrl));
    const linked = await this.getLinkedProperty(siteId, userId);

    return {
      linked,
      recommendedPropertyId: this.recommendProperty(rows, site.normalizedDomain)?.id ?? null,
      site: {
        id: site.id,
        domain: site.domain,
        normalizedDomain: site.normalizedDomain,
        projectId: site.projectId,
      },
      properties: rows.map((row) => ({
        ...this.toResponse(row),
        match: this.propertyMatch(row.siteUrl, site.normalizedDomain),
      })),
    };
  }

  async linkProperty(siteId: string, userId: string, searchConsolePropertyId: string) {
    const site = await this.getSiteWithPermission(siteId, userId, Permission.SITE_WRITE);
    const property = await this.getPropertyForProject(site.projectId, searchConsolePropertyId);
    if (this.propertyMatch(property.siteUrl, site.normalizedDomain) === 'none') {
      throw new BadRequestException(
        'Search Console property does not cover this SeoTracker domain',
      );
    }
    const now = new Date();

    const [link] = await this.db
      .insert(siteSearchConsoleLinks)
      .values({
        siteId: site.id,
        searchConsolePropertyId: property.id,
        linkedByUserId: userId,
        active: true,
        linkedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: siteSearchConsoleLinks.siteId,
        set: {
          active: true,
          linkedByUserId: userId,
          linkedAt: now,
          searchConsolePropertyId: property.id,
          updatedAt: now,
        },
      })
      .returning();

    if (!link) {
      throw new Error('Search Console link upsert did not return a row');
    }

    // Kick off a one-off historical backfill so the new section has data immediately.
    // Best-effort: a Redis hiccup must not fail the linking request — the daily cron recovers.
    try {
      const backfillMonths = this.configService.get('GSC_BACKFILL_MONTHS', { infer: true });
      await this.queueService.enqueueGscImport({
        siteId: site.id,
        startDate: this.monthsAgo(backfillMonths),
        endDate: this.daysAgo(2),
        backfill: true,
      });
    } catch (error) {
      this.logger.warn(`Failed to enqueue GSC backfill for site ${site.id}: ${String(error)}`);
    }

    return {
      active: link.active,
      linkedAt: link.linkedAt,
      linkedByUserId: link.linkedByUserId,
      property: this.toResponse(property),
      siteId: link.siteId,
      updatedAt: link.updatedAt,
    };
  }

  async unlinkProperty(siteId: string, userId: string) {
    const site = await this.getSiteWithPermission(siteId, userId, Permission.SITE_WRITE);
    await this.db.delete(siteSearchConsoleLinks).where(eq(siteSearchConsoleLinks.siteId, site.id));
    return { success: true };
  }

  /**
   * Imports Search Console performance for a site the caller has SITE_WRITE on.
   * The cron uses {@link runScheduledImport} instead, which skips the permission check.
   */
  async importPerformance(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string } = {},
  ) {
    const context = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_WRITE);
    return this.importPerformanceForLink(context, input);
  }

  /**
   * System-context import used by the daily cron and the backfill job. Resolves the active link
   * without a user/permission check (the worker runs as the platform, not a member).
   */
  async runScheduledImport(siteId: string, input: { startDate?: string; endDate?: string } = {}) {
    const context = await this.getActiveLinkBySiteId(siteId);
    return this.importPerformanceForLink(context, input);
  }

  /** Active Search Console links across all sites, for the scheduler to fan out daily imports. */
  async listActiveLinks() {
    return this.db
      .select({
        siteId: siteSearchConsoleLinks.siteId,
        lastImportedAt: siteSearchConsoleLinks.lastImportedAt,
      })
      .from(siteSearchConsoleLinks)
      .innerJoin(sites, eq(sites.id, siteSearchConsoleLinks.siteId))
      .where(and(eq(siteSearchConsoleLinks.active, true), eq(sites.active, true)));
  }

  private async importPerformanceForLink(
    context: {
      link: typeof siteSearchConsoleLinks.$inferSelect;
      property: typeof searchConsoleProperties.$inferSelect;
      site: typeof sites.$inferSelect;
    },
    input: { startDate?: string; endDate?: string },
  ) {
    const { link, property, site } = context;
    const { startDate, endDate } = this.resolveDateRange(input);
    const { accessToken } = await this.googleOauthService.getValidAccessToken(
      property.projectId,
      property.googleConnectionId,
    );
    const dimensionFilterGroups = this.pageFilterGroupsForDomainProperty(
      property.siteUrl,
      site.normalizedDomain,
    );

    let importedRows = 0;
    const imports = await Promise.all(
      DEFAULT_IMPORT_DIMENSIONS.map(async (dimensions) => {
        const rows = await this.fetchAllSearchAnalyticsRows(accessToken, property.siteUrl, {
          dimensions,
          dimensionFilterGroups,
          endDate,
          startDate,
        });
        const values = rows.map((row) => ({
          clicks: Math.round(row.clicks),
          ctr: row.ctr,
          date: this.dimensionValue(dimensions, row.keys, 'date') || startDate,
          device: this.dimensionValue(dimensions, row.keys, 'device'),
          impressions: Math.round(row.impressions),
          page: this.dimensionValue(dimensions, row.keys, 'page'),
          position: row.position,
          query: this.dimensionValue(dimensions, row.keys, 'query'),
          country: this.dimensionValue(dimensions, row.keys, 'country'),
          searchConsolePropertyId: property.id,
          searchType: 'web' as const,
          siteId: link.siteId,
        }));
        const saved = await this.upsertGscStats(values);
        importedRows += saved;
        return { dimensions, rows: saved };
      }),
    );

    await this.db
      .update(siteSearchConsoleLinks)
      .set({ lastImportedAt: new Date(), updatedAt: new Date() })
      .where(eq(siteSearchConsoleLinks.siteId, link.siteId));

    return {
      endDate,
      importedRows,
      imports,
      searchConsolePropertyId: property.id,
      siteId: link.siteId,
      startDate,
    };
  }

  /** Pages through searchAnalytics.query until a partial page signals the end of the result set. */
  private async fetchAllSearchAnalyticsRows(
    accessToken: string,
    siteUrl: string,
    params: {
      dimensions: SearchConsoleDimension[];
      dimensionFilterGroups: SearchConsoleDimensionFilterGroup[] | undefined;
      startDate: string;
      endDate: string;
    },
  ): Promise<SearchAnalyticsRow[]> {
    const all: SearchAnalyticsRow[] = [];
    let startRow = 0;

    for (;;) {
      const page = await this.searchConsoleClient.querySearchAnalytics(accessToken, siteUrl, {
        dimensions: params.dimensions,
        dimensionFilterGroups: params.dimensionFilterGroups,
        endDate: params.endDate,
        rowLimit: SEARCH_CONSOLE_ROW_LIMIT,
        searchType: 'web',
        startDate: params.startDate,
        startRow,
      });
      all.push(...page);
      if (page.length < SEARCH_CONSOLE_ROW_LIMIT) {
        break;
      }
      startRow += SEARCH_CONSOLE_ROW_LIMIT;
    }

    return all;
  }

  async getPerformanceSummary(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string } = {},
  ) {
    const { link } = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_READ);
    const { startDate, endDate } = this.resolveDateRange(input);
    const [row] = await this.db
      .select({
        clicks: sql<number>`coalesce(sum(${gscDailyStats.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else coalesce(sum(${gscDailyStats.clicks}), 0)::float / sum(${gscDailyStats.impressions}) end`,
        impressions: sql<number>`coalesce(sum(${gscDailyStats.impressions}), 0)::int`,
        position: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else sum(${gscDailyStats.position} * ${gscDailyStats.impressions}) / sum(${gscDailyStats.impressions}) end`,
      })
      .from(gscDailyStats)
      .where(this.baseStatsWhere(link.siteId, link.searchConsolePropertyId, startDate, endDate));

    return {
      clicks: Number(row?.clicks ?? 0),
      ctr: Number(row?.ctr ?? 0),
      endDate,
      impressions: Number(row?.impressions ?? 0),
      position: Number(row?.position ?? 0),
      startDate,
    };
  }

  async getPerformanceTimeseries(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string } = {},
  ) {
    const { link } = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_READ);
    const { startDate, endDate } = this.resolveDateRange(input);
    return this.db
      .select({
        clicks: sql<number>`coalesce(sum(${gscDailyStats.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else coalesce(sum(${gscDailyStats.clicks}), 0)::float / sum(${gscDailyStats.impressions}) end`,
        date: gscDailyStats.date,
        impressions: sql<number>`coalesce(sum(${gscDailyStats.impressions}), 0)::int`,
        position: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else sum(${gscDailyStats.position} * ${gscDailyStats.impressions}) / sum(${gscDailyStats.impressions}) end`,
      })
      .from(gscDailyStats)
      .where(this.baseStatsWhere(link.siteId, link.searchConsolePropertyId, startDate, endDate))
      .groupBy(gscDailyStats.date)
      .orderBy(asc(gscDailyStats.date));
  }

  async getTopQueries(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    return this.getTopDimension(siteId, userId, 'query', input);
  }

  async getTopPages(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    return this.getTopDimension(siteId, userId, 'page', input);
  }

  async getTopCountries(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    return this.getTopDimension(siteId, userId, 'country', input);
  }

  async getTopDevices(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    return this.getTopDimension(siteId, userId, 'device', input);
  }

  /**
   * "Striking distance" opportunities: queries whose weighted average position sits between 5 and
   * 20, ranked by the extra clicks they could win if their CTR reached a page-one target. These
   * are the cheapest wins — already ranking, just not high enough to convert impressions.
   */
  async getOpportunities(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    const { link } = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_READ);
    const { startDate, endDate } = this.resolveDateRange(input);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const positionExpr = sql<number>`sum(${gscDailyStats.position} * ${gscDailyStats.impressions}) / nullif(sum(${gscDailyStats.impressions}), 0)`;

    const rows = await this.db
      .select({
        clicks: sql<number>`coalesce(sum(${gscDailyStats.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else coalesce(sum(${gscDailyStats.clicks}), 0)::float / sum(${gscDailyStats.impressions}) end`,
        impressions: sql<number>`coalesce(sum(${gscDailyStats.impressions}), 0)::int`,
        position: positionExpr,
        value: gscDailyStats.query,
      })
      .from(gscDailyStats)
      .where(
        and(
          eq(gscDailyStats.siteId, link.siteId),
          eq(gscDailyStats.searchConsolePropertyId, link.searchConsolePropertyId),
          gte(gscDailyStats.date, startDate),
          lte(gscDailyStats.date, endDate),
          sql`${gscDailyStats.query} <> ''`,
          eq(gscDailyStats.page, ''),
          eq(gscDailyStats.country, ''),
          eq(gscDailyStats.device, ''),
          eq(gscDailyStats.searchType, 'web'),
        ),
      )
      .groupBy(gscDailyStats.query)
      .having(
        sql`sum(${gscDailyStats.impressions}) >= ${OPPORTUNITY_MIN_IMPRESSIONS} and (${positionExpr}) >= 5 and (${positionExpr}) <= 20`,
      )
      .orderBy(desc(sql`sum(${gscDailyStats.impressions})`))
      .limit(OPPORTUNITY_CANDIDATE_CAP);

    return rows
      .map((row) => {
        const ctr = Number(row.ctr);
        const impressions = Number(row.impressions);
        const potentialClicks = Math.max(
          0,
          Math.round(impressions * (OPPORTUNITY_TARGET_CTR - ctr)),
        );
        return {
          clicks: Number(row.clicks),
          ctr,
          impressions,
          position: Number(row.position),
          potentialClicks,
          value: row.value,
        };
      })
      .sort((a, b) => b.potentialClicks - a.potentialClicks)
      .slice(0, limit);
  }

  /**
   * Keyword cannibalization: queries where two or more of the site's own URLs compete in search.
   * Built from the query+page rows, grouped by query, keeping only queries served by 2+ pages.
   * Ranked by total impressions so the most visible conflicts surface first.
   */
  async getCannibalization(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    const { link } = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_READ);
    const { startDate, endDate } = this.resolveDateRange(input);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    const rows = await this.db
      .select({
        clicks: sql<number>`coalesce(sum(${gscDailyStats.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else coalesce(sum(${gscDailyStats.clicks}), 0)::float / sum(${gscDailyStats.impressions}) end`,
        impressions: sql<number>`coalesce(sum(${gscDailyStats.impressions}), 0)::int`,
        page: gscDailyStats.page,
        position: sql<number>`sum(${gscDailyStats.position} * ${gscDailyStats.impressions}) / nullif(sum(${gscDailyStats.impressions}), 0)`,
        query: gscDailyStats.query,
      })
      .from(gscDailyStats)
      .where(
        and(
          eq(gscDailyStats.siteId, link.siteId),
          eq(gscDailyStats.searchConsolePropertyId, link.searchConsolePropertyId),
          gte(gscDailyStats.date, startDate),
          lte(gscDailyStats.date, endDate),
          sql`${gscDailyStats.query} <> ''`,
          sql`${gscDailyStats.page} <> ''`,
          eq(gscDailyStats.country, ''),
          eq(gscDailyStats.device, ''),
          eq(gscDailyStats.searchType, 'web'),
        ),
      )
      .groupBy(gscDailyStats.query, gscDailyStats.page)
      .having(sql`sum(${gscDailyStats.impressions}) >= ${CANNIBALIZATION_MIN_IMPRESSIONS}`)
      .orderBy(gscDailyStats.query, desc(sql`sum(${gscDailyStats.clicks})`))
      .limit(CANNIBALIZATION_ROW_CAP);

    const groups = new Map<
      string,
      {
        query: string;
        clicks: number;
        impressions: number;
        pages: Array<{
          page: string;
          clicks: number;
          impressions: number;
          ctr: number;
          position: number;
        }>;
      }
    >();

    for (const row of rows) {
      const group = groups.get(row.query) ?? {
        query: row.query,
        clicks: 0,
        impressions: 0,
        pages: [],
      };
      const clicks = Number(row.clicks);
      const impressions = Number(row.impressions);
      group.clicks += clicks;
      group.impressions += impressions;
      group.pages.push({
        clicks,
        ctr: Number(row.ctr),
        impressions,
        page: row.page,
        position: Number(row.position),
      });
      groups.set(row.query, group);
    }

    return [...groups.values()]
      .filter((group) => group.pages.length >= 2)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit);
  }

  private async upsertProperty(input: typeof searchConsoleProperties.$inferInsert) {
    const [property] = await this.db
      .insert(searchConsoleProperties)
      .values(input)
      .onConflictDoUpdate({
        target: [searchConsoleProperties.googleConnectionId, searchConsoleProperties.siteUrl],
        set: {
          lastSyncedAt: input.lastSyncedAt,
          permissionLevel: sql`excluded.permission_level`,
          projectId: input.projectId,
          updatedAt: input.lastSyncedAt,
          verified: input.verified,
        },
      })
      .returning();

    if (!property) {
      throw new Error('Search Console property upsert did not return a row');
    }

    return property;
  }

  /** Idempotent batch upsert of GSC rows, chunked to keep backfills off a per-row round-trip. */
  private async upsertGscStats(inputs: (typeof gscDailyStats.$inferInsert)[]): Promise<number> {
    if (inputs.length === 0) {
      return 0;
    }

    const now = new Date();
    let saved = 0;
    for (let offset = 0; offset < inputs.length; offset += GSC_UPSERT_CHUNK_SIZE) {
      const chunk = inputs
        .slice(offset, offset + GSC_UPSERT_CHUNK_SIZE)
        .map((input) => ({ ...input, updatedAt: now }));
      const rows = await this.db
        .insert(gscDailyStats)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            gscDailyStats.siteId,
            gscDailyStats.searchConsolePropertyId,
            gscDailyStats.date,
            gscDailyStats.query,
            gscDailyStats.page,
            gscDailyStats.country,
            gscDailyStats.device,
            gscDailyStats.searchType,
          ],
          set: {
            clicks: sql`excluded.clicks`,
            ctr: sql`excluded.ctr`,
            impressions: sql`excluded.impressions`,
            position: sql`excluded.position`,
            updatedAt: now,
          },
        })
        .returning({ id: gscDailyStats.id });
      saved += rows.length;
    }

    return saved;
  }

  private async getSiteWithPermission(siteId: string, userId: string, permission: Permission) {
    const [site] = await this.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    await this.projectsService.assertPermission(site.projectId, userId, permission);
    return site;
  }

  private async getPropertyForProject(projectId: string, searchConsolePropertyId: string) {
    const [property] = await this.db
      .select()
      .from(searchConsoleProperties)
      .where(
        and(
          eq(searchConsoleProperties.id, searchConsolePropertyId),
          eq(searchConsoleProperties.projectId, projectId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundException('Search Console property not found');
    }
    if (!property.verified) {
      throw new BadRequestException('Search Console property is not verified');
    }

    return property;
  }

  private async getActiveLinkWithProperty(siteId: string, userId: string, permission: Permission) {
    const site = await this.getSiteWithPermission(siteId, userId, permission);
    const [row] = await this.db
      .select({
        link: siteSearchConsoleLinks,
        property: searchConsoleProperties,
      })
      .from(siteSearchConsoleLinks)
      .innerJoin(
        searchConsoleProperties,
        eq(siteSearchConsoleLinks.searchConsolePropertyId, searchConsoleProperties.id),
      )
      .where(
        and(eq(siteSearchConsoleLinks.siteId, site.id), eq(siteSearchConsoleLinks.active, true)),
      )
      .limit(1);

    if (!row) {
      throw new BadRequestException('Site is not linked to a Search Console property');
    }

    return { ...row, site };
  }

  /** Resolves the active link + property + site for a site without a permission check (cron use). */
  private async getActiveLinkBySiteId(siteId: string) {
    const [site] = await this.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const [row] = await this.db
      .select({
        link: siteSearchConsoleLinks,
        property: searchConsoleProperties,
      })
      .from(siteSearchConsoleLinks)
      .innerJoin(
        searchConsoleProperties,
        eq(siteSearchConsoleLinks.searchConsolePropertyId, searchConsoleProperties.id),
      )
      .where(
        and(eq(siteSearchConsoleLinks.siteId, site.id), eq(siteSearchConsoleLinks.active, true)),
      )
      .limit(1);

    if (!row) {
      throw new BadRequestException('Site is not linked to a Search Console property');
    }

    return { ...row, site };
  }

  private async getTopDimension(
    siteId: string,
    userId: string,
    dimension: 'country' | 'device' | 'page' | 'query',
    input: { startDate?: string; endDate?: string; limit?: number },
  ) {
    const { link } = await this.getActiveLinkWithProperty(siteId, userId, Permission.SITE_READ);
    const { startDate, endDate } = this.resolveDateRange(input);
    const column = {
      country: gscDailyStats.country,
      device: gscDailyStats.device,
      page: gscDailyStats.page,
      query: gscDailyStats.query,
    }[dimension];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    return this.db
      .select({
        clicks: sql<number>`coalesce(sum(${gscDailyStats.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else coalesce(sum(${gscDailyStats.clicks}), 0)::float / sum(${gscDailyStats.impressions}) end`,
        impressions: sql<number>`coalesce(sum(${gscDailyStats.impressions}), 0)::int`,
        position: sql<number>`case when coalesce(sum(${gscDailyStats.impressions}), 0) = 0 then 0 else sum(${gscDailyStats.position} * ${gscDailyStats.impressions}) / sum(${gscDailyStats.impressions}) end`,
        value: column,
      })
      .from(gscDailyStats)
      .where(
        and(
          eq(gscDailyStats.siteId, link.siteId),
          eq(gscDailyStats.searchConsolePropertyId, link.searchConsolePropertyId),
          gte(gscDailyStats.date, startDate),
          lte(gscDailyStats.date, endDate),
          sql`${column} <> ''`,
          dimension === 'query' ? sql`true` : eq(gscDailyStats.query, ''),
          dimension === 'page' ? sql`true` : eq(gscDailyStats.page, ''),
          dimension === 'country' ? sql`true` : eq(gscDailyStats.country, ''),
          dimension === 'device' ? sql`true` : eq(gscDailyStats.device, ''),
          eq(gscDailyStats.searchType, 'web'),
        ),
      )
      .groupBy(column)
      .orderBy(desc(sql`sum(${gscDailyStats.clicks})`))
      .limit(limit);
  }

  private baseStatsWhere(
    siteId: string,
    searchConsolePropertyId: string,
    startDate: string,
    endDate: string,
  ) {
    return and(
      eq(gscDailyStats.siteId, siteId),
      eq(gscDailyStats.searchConsolePropertyId, searchConsolePropertyId),
      gte(gscDailyStats.date, startDate),
      lte(gscDailyStats.date, endDate),
      eq(gscDailyStats.query, ''),
      eq(gscDailyStats.page, ''),
      eq(gscDailyStats.country, ''),
      eq(gscDailyStats.device, ''),
      eq(gscDailyStats.searchType, 'web'),
    );
  }

  private resolveDateRange(input: { startDate?: string; endDate?: string }) {
    const end = input.endDate ? this.toDateOnly(input.endDate) : this.daysAgo(3);
    const start = input.startDate ? this.toDateOnly(input.startDate) : this.daysBefore(end, 27);
    if (start > end) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    return { endDate: end, startDate: start };
  }

  private dimensionValue(
    dimensions: SearchConsoleDimension[],
    keys: string[] | undefined,
    dimension: SearchConsoleDimension,
  ) {
    const index = dimensions.indexOf(dimension);
    return index !== -1 ? (keys?.[index] ?? '') : '';
  }

  private toDateOnly(value: string) {
    return value.slice(0, 10);
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  private daysBefore(dateOnly: string, days: number) {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  private monthsAgo(months: number) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
  }

  private recommendProperty(
    properties: (typeof searchConsoleProperties.$inferSelect)[],
    normalizedDomain: string,
  ) {
    const verifiedProperties = properties.filter((property) => property.verified);
    return (
      verifiedProperties.find(
        (property) => this.propertyMatch(property.siteUrl, normalizedDomain) === 'domain-property',
      ) ??
      verifiedProperties.find(
        (property) =>
          this.propertyMatch(property.siteUrl, normalizedDomain) === 'exact-url-prefix' ||
          this.propertyMatch(property.siteUrl, normalizedDomain) === 'www-url-prefix',
      ) ??
      verifiedProperties.find(
        (property) => this.propertyMatch(property.siteUrl, normalizedDomain) === 'related',
      ) ??
      null
    );
  }

  private propertyMatch(siteUrl: string, normalizedDomain: string) {
    const domainProperty = this.domainPropertyHost(siteUrl);
    if (domainProperty) {
      if (normalizedDomain === domainProperty) {
        return 'domain-property';
      }
      if (normalizedDomain.endsWith(`.${domainProperty}`)) {
        return 'related';
      }
      return 'none';
    }

    const urlPrefixHost = this.urlPrefixHost(siteUrl);
    if (!urlPrefixHost || urlPrefixHost !== normalizedDomain) {
      return 'none';
    }

    if (urlPrefixHost.startsWith('www.')) {
      return 'www-url-prefix';
    }
    return 'exact-url-prefix';
  }

  private pageFilterGroupsForDomainProperty(
    siteUrl: string,
    normalizedDomain: string,
  ): SearchConsoleDimensionFilterGroup[] | undefined {
    if (!this.domainPropertyHost(siteUrl)) {
      return undefined;
    }

    return [
      {
        groupType: 'and',
        filters: [
          {
            dimension: 'page',
            expression: `://${normalizedDomain}`,
            operator: 'contains',
          },
        ],
      },
    ];
  }

  private domainPropertyHost(siteUrl: string) {
    return siteUrl.startsWith('sc-domain:') ? siteUrl.replace('sc-domain:', '').toLowerCase() : '';
  }

  private urlPrefixHost(siteUrl: string) {
    try {
      return new URL(siteUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private toResponse(row: typeof searchConsoleProperties.$inferSelect) {
    return {
      id: row.id,
      projectId: row.projectId,
      googleConnectionId: row.googleConnectionId,
      siteUrl: row.siteUrl,
      permissionLevel: row.permissionLevel,
      verified: row.verified,
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
