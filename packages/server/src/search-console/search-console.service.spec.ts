import { describe, expect, it, jest } from '@jest/globals';
import { Permission } from '@seotracker/shared-types';

import { SearchConsoleService } from './search-console.service';

function makeDb() {
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockReturnValue({ where: deleteWhere });
  const limit = jest.fn();
  const returning = jest.fn();
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoNothing, onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });
  const orderBy = jest.fn();
  const having = jest.fn().mockReturnValue({ orderBy });
  const groupBy = jest.fn().mockReturnValue({ having, orderBy });
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set });
  const where = jest.fn().mockReturnValue({ groupBy, limit, orderBy });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ innerJoin, where });
  const select = jest.fn().mockReturnValue({ from });
  return {
    delete: deleteFn,
    deleteWhere,
    from,
    groupBy,
    having,
    innerJoin,
    insert,
    limit,
    onConflictDoNothing,
    onConflictDoUpdate,
    orderBy,
    returning,
    select,
    set,
    update,
    updateWhere,
    values,
    where,
  };
}

/** Active link + property + site rows the read methods resolve before querying gsc_daily_stats. */
function linkLookupRows() {
  return {
    site: { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
    link: { siteId: 'site-1', searchConsolePropertyId: 'property-1', active: true },
  };
}

function makeService() {
  const db = makeDb();
  const projectsService = { assertPermission: jest.fn().mockResolvedValue(undefined) };
  const googleOauthService = {
    getValidAccessToken: jest.fn().mockResolvedValue({ accessToken: 'access-token' }),
  };
  const searchConsoleClient = {
    listSites: jest.fn().mockResolvedValue([
      { permissionLevel: 'siteOwner', siteUrl: 'sc-domain:example.com' },
      { permissionLevel: 'siteUnverifiedUser', siteUrl: 'https://unverified.example.com/' },
    ]),
    querySearchAnalytics: jest.fn().mockResolvedValue([]),
  };
  const queueService = { enqueueGscImport: jest.fn().mockResolvedValue(undefined) };
  const configService = { get: jest.fn().mockReturnValue(16) };
  const service = new SearchConsoleService(
    db as never,
    projectsService as never,
    googleOauthService as never,
    searchConsoleClient as never,
    queueService as never,
    configService as never,
  );
  return {
    configService,
    db,
    googleOauthService,
    projectsService,
    queueService,
    searchConsoleClient,
    service,
  };
}

describe('search console service', () => {
  it('syncs properties from Google and marks unverified permissions', async () => {
    const { db, googleOauthService, projectsService, searchConsoleClient, service } = makeService();
    jest
      .mocked(db.returning)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'sc-domain:example.com',
          permissionLevel: 'siteOwner',
          verified: true,
          lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
          createdAt: new Date('2026-06-05T10:00:00.000Z'),
          updatedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-2',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'https://unverified.example.com/',
          permissionLevel: 'siteUnverifiedUser',
          verified: false,
          lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
          createdAt: new Date('2026-06-05T10:00:00.000Z'),
          updatedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      ] as never);

    const result = await service.syncProperties('project-1', 'user-1', 'connection-1');

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_WRITE,
    );
    expect(googleOauthService.getValidAccessToken).toHaveBeenCalledWith(
      'project-1',
      'connection-1',
    );
    expect(searchConsoleClient.listSites).toHaveBeenCalledWith('access-token');
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ verified: false }));
    expect(result.count).toBe(2);
  });

  it('lists already-synced properties for a project', async () => {
    const { db, projectsService, service } = makeService();
    jest.mocked(db.orderBy).mockResolvedValue([
      {
        id: 'property-1',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'sc-domain:example.com',
        permissionLevel: 'siteOwner',
        verified: true,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
    ] as never);

    const rows = await service.listProperties('project-1', 'user-1');

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_READ,
    );
    expect(rows).toStrictEqual([
      expect.objectContaining({ siteUrl: 'sc-domain:example.com', verified: true }),
    ]);
  });

  it('recommends the best matching property candidates for a site', async () => {
    const { db, projectsService, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://example.com',
          normalizedDomain: 'example.com',
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://example.com',
          normalizedDomain: 'example.com',
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    jest.mocked(db.orderBy).mockResolvedValue([
      {
        id: 'property-1',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'https://www.example.com/',
        permissionLevel: 'siteOwner',
        verified: true,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
      {
        id: 'property-2',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'sc-domain:example.com',
        permissionLevel: 'siteOwner',
        verified: true,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
    ] as never);

    const result = await service.listCandidates('site-1', 'user-1');

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.SITE_READ,
    );
    expect(result.recommendedPropertyId).toBe('property-2');
    expect(result.properties).toStrictEqual([
      expect.objectContaining({ match: 'none' }),
      expect.objectContaining({ match: 'domain-property' }),
    ]);
  });

  it('allows domain properties to be candidates for covered subdomains', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://blog.example.com',
          normalizedDomain: 'blog.example.com',
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://blog.example.com',
          normalizedDomain: 'blog.example.com',
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    jest.mocked(db.orderBy).mockResolvedValue([
      {
        id: 'property-1',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'sc-domain:example.com',
        permissionLevel: 'siteOwner',
        verified: true,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
    ] as never);

    const result = await service.listCandidates('site-1', 'user-1');

    expect(result.recommendedPropertyId).toBe('property-1');
    expect(result.properties).toStrictEqual([expect.objectContaining({ match: 'related' })]);
  });

  it('does not recommend unverified properties for a site', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://example.com',
          normalizedDomain: 'example.com',
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'site-1',
          projectId: 'project-1',
          domain: 'https://example.com',
          normalizedDomain: 'example.com',
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    jest.mocked(db.orderBy).mockResolvedValue([
      {
        id: 'property-unverified',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'sc-domain:example.com',
        permissionLevel: 'siteUnverifiedUser',
        verified: false,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
      {
        id: 'property-verified',
        projectId: 'project-1',
        googleConnectionId: 'connection-1',
        siteUrl: 'https://example.com/',
        permissionLevel: 'siteOwner',
        verified: true,
        lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
    ] as never);

    const result = await service.listCandidates('site-1', 'user-1');

    expect(result.recommendedPropertyId).toBe('property-verified');
  });

  it('links a verified Search Console property to a site', async () => {
    const { db, projectsService, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'sc-domain:example.com',
          permissionLevel: 'siteOwner',
          verified: true,
          lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
          createdAt: new Date('2026-06-05T10:00:00.000Z'),
          updatedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      ] as never);
    jest.mocked(db.returning).mockResolvedValue([
      {
        siteId: 'site-1',
        searchConsolePropertyId: 'property-1',
        linkedByUserId: 'user-1',
        active: true,
        linkedAt: new Date('2026-06-05T10:00:00.000Z'),
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
    ] as never);

    const result = await service.linkProperty('site-1', 'user-1', 'property-1');

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.SITE_WRITE,
    );
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ searchConsolePropertyId: 'property-1', siteId: 'site-1' }),
    );
    expect(result.property.siteUrl).toBe('sc-domain:example.com');
  });

  it('rejects linking a property that does not cover the SeoTracker site domain', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'sc-domain:other.test',
          permissionLevel: 'siteOwner',
          verified: true,
          lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
          createdAt: new Date('2026-06-05T10:00:00.000Z'),
          updatedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      ] as never);

    await expect(service.linkProperty('site-1', 'user-1', 'property-1')).rejects.toThrow(
      'Search Console property does not cover this SeoTracker domain',
    );
    expect(db.values).not.toHaveBeenCalled();
  });

  it('filters domain-property imports to the linked SeoTracker domain', async () => {
    const { db, googleOauthService, searchConsoleClient, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'blog.example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          link: {
            siteId: 'site-1',
            searchConsolePropertyId: 'property-1',
            active: true,
            linkedAt: new Date('2026-06-05T10:00:00.000Z'),
            linkedByUserId: 'user-1',
            updatedAt: new Date('2026-06-05T10:00:00.000Z'),
          },
          property: {
            id: 'property-1',
            projectId: 'project-1',
            googleConnectionId: 'connection-1',
            siteUrl: 'sc-domain:example.com',
            permissionLevel: 'siteOwner',
            verified: true,
            lastSyncedAt: new Date('2026-06-05T10:00:00.000Z'),
            createdAt: new Date('2026-06-05T10:00:00.000Z'),
            updatedAt: new Date('2026-06-05T10:00:00.000Z'),
          },
        },
      ] as never);

    await service.importPerformance('site-1', 'user-1', {
      endDate: '2026-06-05',
      startDate: '2026-06-01',
    });

    expect(googleOauthService.getValidAccessToken).toHaveBeenCalledWith(
      'project-1',
      'connection-1',
    );
    expect(searchConsoleClient.querySearchAnalytics).toHaveBeenCalledWith(
      'access-token',
      'sc-domain:example.com',
      expect.objectContaining({
        dimensionFilterGroups: [
          {
            groupType: 'and',
            filters: [
              {
                dimension: 'page',
                expression: '://blog.example.com',
                operator: 'contains',
              },
            ],
          },
        ],
      }),
    );
  });

  it('enqueues a historical backfill when a property is linked', async () => {
    const { configService, db, queueService, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'sc-domain:example.com',
          verified: true,
        },
      ] as never);
    jest
      .mocked(db.returning)
      .mockResolvedValue([
        { siteId: 'site-1', searchConsolePropertyId: 'property-1', active: true },
      ] as never);

    await service.linkProperty('site-1', 'user-1', 'property-1');

    expect(configService.get).toHaveBeenCalledWith('GSC_BACKFILL_MONTHS', { infer: true });
    expect(queueService.enqueueGscImport).toHaveBeenCalledWith(
      expect.objectContaining({ backfill: true, siteId: 'site-1' }),
    );
  });

  it('does not fail linking when the backfill enqueue throws', async () => {
    const { db, queueService, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'sc-domain:example.com',
          verified: true,
        },
      ] as never);
    jest
      .mocked(db.returning)
      .mockResolvedValue([
        { siteId: 'site-1', searchConsolePropertyId: 'property-1', active: true },
      ] as never);
    queueService.enqueueGscImport.mockRejectedValueOnce(new Error('redis down') as never);

    await expect(service.linkProperty('site-1', 'user-1', 'property-1')).resolves.toMatchObject({
      siteId: 'site-1',
    });
  });

  it('runs a scheduled import without a permission check, paginating and batching upserts', async () => {
    const { db, projectsService, searchConsoleClient, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          link: { siteId: 'site-1', searchConsolePropertyId: 'property-1', active: true },
          property: {
            id: 'property-1',
            projectId: 'project-1',
            googleConnectionId: 'connection-1',
            siteUrl: 'sc-domain:example.com',
            verified: true,
          },
        },
      ] as never);
    // First fetch returns a full page (forces a second paginated request); the rest are empty.
    const fullPage = Array.from({ length: 25_000 }, () => ({
      keys: ['2026-06-01'],
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 5,
    }));
    searchConsoleClient.querySearchAnalytics.mockResolvedValueOnce(fullPage).mockResolvedValue([]);
    jest.mocked(db.returning).mockResolvedValue([{ id: 'row' }] as never);

    const result = await service.runScheduledImport('site-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    expect(projectsService.assertPermission).not.toHaveBeenCalled();
    // 25k rows chunked at 500 → 50 upsert batches reported as imported rows.
    expect(result.importedRows).toBe(50);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a scheduled import when the site is not found', async () => {
    const { db, service } = makeService();
    jest.mocked(db.limit).mockResolvedValueOnce([] as never);

    await expect(service.runScheduledImport('missing')).rejects.toThrow('Site not found');
  });

  it('rejects a scheduled import when the site has no active link', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([] as never);

    await expect(service.runScheduledImport('site-1')).rejects.toThrow(
      'Site is not linked to a Search Console property',
    );
  });

  it('lists active links across sites for the scheduler', async () => {
    const { db, service } = makeService();
    jest.mocked(db.where).mockReturnValueOnce([
      { siteId: 'site-1', lastImportedAt: null },
      { siteId: 'site-2', lastImportedAt: new Date('2026-06-04T00:00:00.000Z') },
    ] as never);

    const links = await service.listActiveLinks();

    expect(links).toHaveLength(2);
    expect(links[0]).toStrictEqual({ siteId: 'site-1', lastImportedAt: null });
  });

  it('unlinks the active property from a site', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never);

    await expect(service.unlinkProperty('site-1', 'user-1')).resolves.toStrictEqual({
      success: true,
    });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('aggregates a performance summary over the resolved range', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.where)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockResolvedValueOnce([
        { clicks: 120, ctr: 0.05, impressions: 2400, position: 7.2 },
      ] as never);
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);

    const summary = await service.getPerformanceSummary('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    expect(summary).toMatchObject({ clicks: 120, impressions: 2400, position: 7.2 });
  });

  it('falls back to zeroes when the summary aggregate is empty', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.where)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockResolvedValueOnce([] as never);
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);

    const summary = await service.getPerformanceSummary('site-1', 'user-1');

    expect(summary).toMatchObject({ clicks: 0, ctr: 0, impressions: 0, position: 0 });
  });

  it('returns a daily timeseries grouped by date', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);
    jest
      .mocked(db.orderBy)
      .mockResolvedValueOnce([
        { clicks: 10, ctr: 0.1, date: '2026-06-01', impressions: 100, position: 5 },
      ] as never);

    const series = await service.getPerformanceTimeseries('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    expect(series).toStrictEqual([
      { clicks: 10, ctr: 0.1, date: '2026-06-01', impressions: 100, position: 5 },
    ]);
    expect(db.groupBy).toHaveBeenCalledTimes(1);
  });

  it('returns top queries clamping the requested limit', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
      .mockResolvedValueOnce([{ value: 'seo tool', clicks: 50, impressions: 800 }] as never);
    jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);

    const rows = await service.getTopQueries('site-1', 'user-1', { limit: 500 });

    expect(rows).toStrictEqual([{ value: 'seo tool', clicks: 50, impressions: 800 }]);
  });

  it('adds per-row previous clicks when a comparison range is supplied', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
      .mockResolvedValueOnce([
        { value: 'a', clicks: 50, ctr: 0.1, impressions: 800, position: 4 },
        { value: 'b', clicks: 30, ctr: 0.05, impressions: 600, position: 6 },
      ] as never);
    jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);
    // First groupBy is the main top-N query (chains into orderBy/limit); the second groupBy is the
    // comparison-clicks query, which is awaited directly and resolves the previous-period rows.
    jest
      .mocked(db.groupBy)
      .mockReturnValueOnce({ having: db.having, orderBy: db.orderBy } as never)
      .mockReturnValueOnce([{ value: 'a', clicks: 40 }] as never);

    const rows = (await service.getTopQueries('site-1', 'user-1', {
      compareEndDate: '2026-05-28',
      compareStartDate: '2026-05-01',
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    })) as Array<{ value: string; previousClicks: number }>;

    expect(rows[0]).toMatchObject({ previousClicks: 40, value: 'a' });
    expect(rows[1]).toMatchObject({ previousClicks: 0, value: 'b' });
  });

  it.each(['getTopPages', 'getTopCountries', 'getTopDevices'] as const)(
    'exposes %s through the shared dimension query',
    async (method) => {
      const { db, service } = makeService();
      const { site, link } = linkLookupRows();
      jest
        .mocked(db.limit)
        .mockResolvedValueOnce([site] as never)
        .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
        .mockResolvedValueOnce([{ value: 'x', clicks: 1, impressions: 2 }] as never);
      jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);

      await expect(service[method]('site-1', 'user-1', {})).resolves.toStrictEqual([
        { value: 'x', clicks: 1, impressions: 2 },
      ]);
    },
  );

  it('ranks striking-distance opportunities by potential clicks', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
      .mockResolvedValueOnce([
        { value: 'b', clicks: 5, ctr: 0.01, impressions: 500, position: 12 },
        { value: 'a', clicks: 20, ctr: 0.02, impressions: 1000, position: 8 },
        { value: 'c', clicks: 200, ctr: 0.2, impressions: 1000, position: 6 },
      ] as never);
    jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);

    const rows = await service.getOpportunities('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    // Sorted by potential clicks using the position CTR curve:
    // a → target pos 3 (CTR 0.11): 1000×(0.11−0.02)=90; b → target pos 10 (CTR 0.025):
    // 500×(0.025−0.01)≈8; c already above target CTR → 0.
    expect(rows.map((row) => row.value)).toStrictEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ potentialClicks: 90, value: 'a' });
    expect(rows[2]?.potentialClicks).toBe(0);
  });

  it('groups cannibalization by query, keeping only queries served by 2+ pages', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
      .mockResolvedValueOnce([
        { query: 'sandals', page: '/x', clicks: 3, ctr: 0.05, impressions: 60, position: 9 },
        { query: 'sandals', page: '/y', clicks: 2, ctr: 0.04, impressions: 40, position: 11 },
        { query: 'shoes', page: '/a', clicks: 10, ctr: 0.1, impressions: 100, position: 5 },
        { query: 'shoes', page: '/b', clicks: 5, ctr: 0.06, impressions: 80, position: 8 },
        { query: 'boots', page: '/c', clicks: 2, ctr: 0.04, impressions: 50, position: 3 },
        // 'menu' has 2 pages but one URL owns ~99% of impressions → not a real conflict.
        { query: 'menu', page: '/m1', clicks: 90, ctr: 0.09, impressions: 1000, position: 4 },
        { query: 'menu', page: '/m2', clicks: 1, ctr: 0.1, impressions: 10, position: 30 },
      ] as never);
    jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);

    const groups = await service.getCannibalization('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    // Single-page (boots) and dominant-share (menu) queries are dropped; the rest sort by severity.
    expect(groups.map((group) => group.query)).toStrictEqual(['shoes', 'sandals']);
    expect(groups[0]).toMatchObject({ query: 'shoes', clicks: 15, impressions: 180 });
    expect(groups[0]?.severity).toBeGreaterThan(groups[1]?.severity ?? 0);
  });

  it('lists decaying pages comparing the recent half against the previous half', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never)
      .mockResolvedValueOnce([
        { value: '/a', previousClicks: 100, recentClicks: 40 },
        { value: '/b', previousClicks: 50, recentClicks: 30 },
      ] as never);
    jest.mocked(db.orderBy).mockReturnValue({ limit: db.limit } as never);

    const rows = await service.getDecay('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-05-06',
    });

    expect(rows[0]).toMatchObject({ clicksLost: 60, value: '/a' });
    expect(rows[0]?.changeRatio).toBeCloseTo(-0.6);
  });

  function setupDropAlert(recentClicks: number, previousClicks: number) {
    const { db, service } = makeService();
    const { link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([{ id: 'site-1', projectId: 'project-1' }] as never)
      .mockResolvedValueOnce([
        { link, property: { id: 'property-1', projectId: 'project-1' } },
      ] as never);
    const builder = { groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy };
    jest
      .mocked(db.where)
      .mockReturnValueOnce(builder as never)
      .mockReturnValueOnce(builder as never)
      .mockReturnValueOnce([{ clicks: recentClicks }] as never)
      .mockReturnValueOnce([{ clicks: previousClicks }] as never);
    return service;
  }

  it('returns a clicks-drop alert when the week-over-week fall passes the threshold', async () => {
    const alert = await setupDropAlert(40, 100).getClicksDropAlert('site-1');

    expect(alert).toMatchObject({ previousClicks: 100, projectId: 'project-1', recentClicks: 40 });
    expect(alert?.dropRatio).toBeCloseTo(0.6);
  });

  it('returns no alert when the clicks drop is within the threshold', async () => {
    await expect(setupDropAlert(95, 100).getClicksDropAlert('site-1')).resolves.toBeNull();
  });

  it('returns no alert when the previous week has too few clicks', async () => {
    await expect(setupDropAlert(2, 10).getClicksDropAlert('site-1')).resolves.toBeNull();
  });

  it('lists tracked keywords merging aggregated metrics and zero-filling the rest', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);
    jest.mocked(db.orderBy).mockResolvedValueOnce([
      { query: 'kw uno', createdAt: new Date('2026-06-01T00:00:00.000Z') },
      { query: 'kw dos', createdAt: new Date('2026-06-02T00:00:00.000Z') },
    ] as never);
    jest
      .mocked(db.groupBy)
      .mockReturnValueOnce([
        { query: 'kw uno', clicks: 10, ctr: 0.1, impressions: 100, position: 5 },
      ] as never);

    const rows = await service.listTrackedKeywords('site-1', 'user-1', {
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clicks: 10, impressions: 100, query: 'kw uno' });
    expect(rows[1]).toMatchObject({ clicks: 0, impressions: 0, query: 'kw dos' });
  });

  it('returns an empty list when the site has no tracked keywords', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);
    jest.mocked(db.orderBy).mockResolvedValueOnce([] as never);

    await expect(service.listTrackedKeywords('site-1', 'user-1')).resolves.toStrictEqual([]);
  });

  it('tracks a keyword, trimming whitespace and upserting idempotently', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([{ id: 'site-1', projectId: 'project-1' }] as never);

    await expect(service.trackKeyword('site-1', 'user-1', '  zapatillas  ')).resolves.toStrictEqual(
      { query: 'zapatillas', tracked: true },
    );
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'zapatillas', siteId: 'site-1' }),
    );
    expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('rejects tracking an empty keyword', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([{ id: 'site-1', projectId: 'project-1' }] as never);

    await expect(service.trackKeyword('site-1', 'user-1', '   ')).rejects.toThrow(
      'must not be empty',
    );
  });

  it('untracks a keyword for a site', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([{ id: 'site-1', projectId: 'project-1' }] as never);

    await expect(service.untrackKeyword('site-1', 'user-1', 'zapatillas')).resolves.toStrictEqual({
      query: 'zapatillas',
      tracked: false,
    });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('returns a daily timeseries for a single tracked keyword', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);
    jest
      .mocked(db.orderBy)
      .mockResolvedValueOnce([
        { clicks: 4, ctr: 0.08, date: '2026-06-01', impressions: 50, position: 6 },
      ] as never);

    const series = await service.getKeywordTimeseries('site-1', 'user-1', {
      endDate: '2026-06-04',
      query: 'zapatillas',
      startDate: '2026-06-01',
    });

    expect(series).toStrictEqual([
      { clicks: 4, ctr: 0.08, date: '2026-06-01', impressions: 50, position: 6 },
    ]);
  });

  it('segments a keyword timeseries by country', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);
    jest
      .mocked(db.orderBy)
      .mockResolvedValueOnce([
        { clicks: 2, ctr: 0.05, date: '2026-06-01', impressions: 40, position: 7 },
      ] as never);

    const series = await service.getKeywordTimeseries('site-1', 'user-1', {
      country: ' ESP ',
      endDate: '2026-06-04',
      query: 'zapatillas',
      startDate: '2026-06-01',
    });

    expect(series).toHaveLength(1);
  });

  it('splits branded vs non-branded traffic and normalizes the terms', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.where)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockResolvedValueOnce([
        {
          brandedClicks: 100,
          brandedCtr: 0.1,
          brandedImpressions: 1000,
          brandedPosition: 3,
          nonBrandedClicks: 50,
          nonBrandedCtr: 0.05,
          nonBrandedImpressions: 800,
          nonBrandedPosition: 7,
        },
      ] as never);
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);

    const result = await service.getBrandSplit('site-1', 'user-1', {
      brandTerms: ['Nike', ' adidas ', ''],
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });

    expect(result.terms).toStrictEqual(['nike', 'adidas']);
    expect(result.branded).toMatchObject({ clicks: 100, impressions: 1000 });
    expect(result.nonBranded).toMatchObject({ clicks: 50, impressions: 800 });
  });

  it('handles a brand split with no terms (everything is non-branded)', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.where)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockReturnValueOnce({ groupBy: db.groupBy, limit: db.limit, orderBy: db.orderBy } as never)
      .mockResolvedValueOnce([] as never);
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);

    const result = await service.getBrandSplit('site-1', 'user-1', {});

    expect(result.terms).toStrictEqual([]);
    expect(result.branded).toMatchObject({ clicks: 0 });
  });

  it('rejects a range where the start date is after the end date', async () => {
    const { db, service } = makeService();
    const { site, link } = linkLookupRows();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([site] as never)
      .mockResolvedValueOnce([{ link, property: { id: 'property-1' } }] as never);

    await expect(
      service.getPerformanceSummary('site-1', 'user-1', {
        endDate: '2026-06-01',
        startDate: '2026-06-10',
      }),
    ).rejects.toThrow('startDate must be before or equal to endDate');
  });

  it('treats a malformed property URL as not covering the site domain', async () => {
    const { db, service } = makeService();
    jest
      .mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'site-1', projectId: 'project-1', normalizedDomain: 'example.com' },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'property-1',
          projectId: 'project-1',
          googleConnectionId: 'connection-1',
          siteUrl: 'not-a-valid-url',
          verified: true,
        },
      ] as never);

    await expect(service.linkProperty('site-1', 'user-1', 'property-1')).rejects.toThrow(
      'Search Console property does not cover this SeoTracker domain',
    );
  });
});
