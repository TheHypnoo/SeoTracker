import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SearchConsoleController, SiteSearchConsoleController } from './search-console.controller';

describe('searchConsoleController', () => {
  const searchConsoleService = {
    listProperties: jest.fn(() => Promise.resolve('properties')),
    syncProperties: jest.fn(() => Promise.resolve('synced')),
  };
  const controller = new SearchConsoleController(searchConsoleService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists synced properties for the current user and project', async () => {
    await expect(controller.list({ sub: 'user-1' }, 'project-1')).resolves.toBe('properties');
    expect(searchConsoleService.listProperties).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('syncs properties from the provided google connection', async () => {
    await expect(
      controller.sync({ sub: 'user-1' }, 'project-1', { googleConnectionId: 'connection-1' }),
    ).resolves.toBe('synced');
    expect(searchConsoleService.syncProperties).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'connection-1',
    );
  });
});

describe('siteSearchConsoleController', () => {
  const searchConsoleService = {
    getLinkedProperty: jest.fn(() => Promise.resolve('linked')),
    listCandidates: jest.fn(() => Promise.resolve('candidates')),
    linkProperty: jest.fn(() => Promise.resolve('link')),
    unlinkProperty: jest.fn(() => Promise.resolve('unlink')),
    importPerformance: jest.fn(() => Promise.resolve('import')),
    getPerformanceSummary: jest.fn(() => Promise.resolve('summary')),
    getPerformanceTimeseries: jest.fn(() => Promise.resolve('timeseries')),
    getTopQueries: jest.fn(() => Promise.resolve('queries')),
    getTopPages: jest.fn(() => Promise.resolve('pages')),
    getTopCountries: jest.fn(() => Promise.resolve('countries')),
    getTopDevices: jest.fn(() => Promise.resolve('devices')),
    getOpportunities: jest.fn(() => Promise.resolve('opportunities')),
    getCannibalization: jest.fn(() => Promise.resolve('cannibalization')),
    getDecay: jest.fn(() => Promise.resolve('decay')),
    listTrackedKeywords: jest.fn(() => Promise.resolve('keywords')),
    trackKeyword: jest.fn(() => Promise.resolve({ query: 'kw', tracked: true })),
    untrackKeyword: jest.fn(() => Promise.resolve({ query: 'kw', tracked: false })),
    getKeywordTimeseries: jest.fn(() => Promise.resolve('keyword-series')),
    getBrandSplit: jest.fn(() => Promise.resolve({ branded: {}, nonBranded: {}, terms: [] })),
  };
  const controller = new SiteSearchConsoleController(searchConsoleService as never);
  const user = { sub: 'user-1' };
  const range = { startDate: '2026-06-01', endDate: '2026-06-04', limit: 5 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets the active linked property', async () => {
    await expect(controller.getLinked(user, 'site-1')).resolves.toBe('linked');
    expect(searchConsoleService.getLinkedProperty).toHaveBeenCalledWith('site-1', 'user-1');
  });

  it('lists candidate properties', async () => {
    await expect(controller.candidates(user, 'site-1')).resolves.toBe('candidates');
    expect(searchConsoleService.listCandidates).toHaveBeenCalledWith('site-1', 'user-1');
  });

  it('links a property to a site', async () => {
    await expect(
      controller.link(user, 'site-1', { searchConsolePropertyId: 'property-1' }),
    ).resolves.toBe('link');
    expect(searchConsoleService.linkProperty).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      'property-1',
    );
  });

  it('unlinks the active property', async () => {
    await expect(controller.unlink(user, 'site-1')).resolves.toBe('unlink');
    expect(searchConsoleService.unlinkProperty).toHaveBeenCalledWith('site-1', 'user-1');
  });

  it('imports performance data', async () => {
    await expect(
      controller.importPerformance(user, 'site-1', { startDate: '2026-06-01' }),
    ).resolves.toBe('import');
    expect(searchConsoleService.importPerformance).toHaveBeenCalledWith('site-1', 'user-1', {
      startDate: '2026-06-01',
    });
  });

  it.each([
    ['summary', 'getPerformanceSummary', 'summary'],
    ['timeseries', 'getPerformanceTimeseries', 'timeseries'],
    ['topQueries', 'getTopQueries', 'queries'],
    ['topPages', 'getTopPages', 'pages'],
    ['topCountries', 'getTopCountries', 'countries'],
    ['topDevices', 'getTopDevices', 'devices'],
    ['opportunities', 'getOpportunities', 'opportunities'],
    ['cannibalization', 'getCannibalization', 'cannibalization'],
    ['decay', 'getDecay', 'decay'],
    ['listKeywords', 'listTrackedKeywords', 'keywords'],
    ['keywordTimeseries', 'getKeywordTimeseries', 'keyword-series'],
  ] as const)(
    'delegates %s to the service with the range query',
    async (endpoint, serviceFn, expected) => {
      await expect(controller[endpoint](user, 'site-1', range)).resolves.toBe(expected);
      expect(searchConsoleService[serviceFn]).toHaveBeenCalledWith('site-1', 'user-1', range);
    },
  );

  it('tracks a keyword from the request body', async () => {
    await expect(
      controller.trackKeyword(user, 'site-1', { query: 'zapatillas' }),
    ).resolves.toMatchObject({ tracked: true });
    expect(searchConsoleService.trackKeyword).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      'zapatillas',
    );
  });

  it('splits comma-separated brand terms before delegating the brand split', async () => {
    await controller.brandSplit(user, 'site-1', {
      brandTerms: 'nike,adidas',
      endDate: '2026-06-04',
      startDate: '2026-06-01',
    });
    expect(searchConsoleService.getBrandSplit).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      expect.objectContaining({ brandTerms: ['nike', 'adidas'] }),
    );
  });

  it('passes an empty brand-term list when none are provided', async () => {
    await controller.brandSplit(user, 'site-1', {});
    expect(searchConsoleService.getBrandSplit).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      expect.objectContaining({ brandTerms: [] }),
    );
  });

  it('untracks a keyword from the query string', async () => {
    await expect(controller.untrackKeyword(user, 'site-1', 'zapatillas')).resolves.toMatchObject({
      tracked: false,
    });
    expect(searchConsoleService.untrackKeyword).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      'zapatillas',
    );
  });
});
