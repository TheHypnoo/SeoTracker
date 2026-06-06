import { describe, expect, it, jest } from '@jest/globals';
import { Permission } from '@seotracker/shared-types';

import { SearchConsoleService } from './search-console.service';

function makeDb() {
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockReturnValue({ where: deleteWhere });
  const limit = jest.fn();
  const returning = jest.fn();
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });
  const orderBy = jest.fn();
  const where = jest.fn().mockReturnValue({ limit, orderBy });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ innerJoin, where });
  const select = jest.fn().mockReturnValue({ from });
  return {
    delete: deleteFn,
    deleteWhere,
    from,
    innerJoin,
    insert,
    limit,
    onConflictDoUpdate,
    orderBy,
    returning,
    select,
    values,
    where,
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
  const service = new SearchConsoleService(
    db as never,
    projectsService as never,
    googleOauthService as never,
    searchConsoleClient as never,
  );
  return { db, googleOauthService, projectsService, searchConsoleClient, service };
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
});
