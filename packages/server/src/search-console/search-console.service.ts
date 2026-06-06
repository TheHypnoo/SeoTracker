import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@seotracker/shared-types';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

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
import { SEARCH_CONSOLE_UNVERIFIED_PERMISSION } from './search-console.constants';
import {
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
];

@Injectable()
export class SearchConsoleService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
    private readonly googleOauthService: GoogleOauthService,
    private readonly searchConsoleClient: SearchConsoleClient,
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

  async importPerformance(
    siteId: string,
    userId: string,
    input: { startDate?: string; endDate?: string } = {},
  ) {
    const { link, property, site } = await this.getActiveLinkWithProperty(
      siteId,
      userId,
      Permission.SITE_WRITE,
    );
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
        const rows = await this.searchConsoleClient.querySearchAnalytics(
          accessToken,
          property.siteUrl,
          {
            dimensions,
            endDate,
            dimensionFilterGroups,
            searchType: 'web',
            startDate,
          },
        );
        const saved = await Promise.all(
          rows.map((row) =>
            this.upsertGscStat({
              clicks: Math.round(row.clicks),
              ctr: row.ctr,
              date: this.dimensionValue(dimensions, row.keys, 'date') ?? startDate,
              device: this.dimensionValue(dimensions, row.keys, 'device') ?? '',
              impressions: Math.round(row.impressions),
              page: this.dimensionValue(dimensions, row.keys, 'page') ?? '',
              position: row.position,
              query: this.dimensionValue(dimensions, row.keys, 'query') ?? '',
              country: this.dimensionValue(dimensions, row.keys, 'country') ?? '',
              searchConsolePropertyId: property.id,
              searchType: 'web',
              siteId: link.siteId,
            }),
          ),
        );
        importedRows += saved.length;
        return { dimensions, rows: saved.length };
      }),
    );

    return {
      endDate,
      importedRows,
      imports,
      searchConsolePropertyId: property.id,
      siteId,
      startDate,
    };
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

  private async upsertGscStat(input: typeof gscDailyStats.$inferInsert) {
    const now = new Date();
    const [row] = await this.db
      .insert(gscDailyStats)
      .values({ ...input, updatedAt: now })
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
      .returning();

    if (!row) {
      throw new Error('GSC daily stat upsert did not return a row');
    }

    return row;
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
