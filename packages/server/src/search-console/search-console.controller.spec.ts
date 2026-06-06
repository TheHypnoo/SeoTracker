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
  ] as const)(
    'delegates %s to the service with the range query',
    async (endpoint, serviceFn, expected) => {
      await expect(controller[endpoint](user, 'site-1', range)).resolves.toBe(expected);
      expect(searchConsoleService[serviceFn]).toHaveBeenCalledWith('site-1', 'user-1', range);
    },
  );
});
