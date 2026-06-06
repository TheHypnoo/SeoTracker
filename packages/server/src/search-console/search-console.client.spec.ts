import { BadGatewayException } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { SEARCH_CONSOLE_API_BASE_URL, SEARCH_CONSOLE_SITES_URL } from './search-console.constants';
import { SearchConsoleClient } from './search-console.client';

describe('search console client', () => {
  const client = new SearchConsoleClient();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists Search Console site entries', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({
        siteEntry: [{ permissionLevel: 'siteOwner', siteUrl: 'sc-domain:example.com' }],
      }),
      ok: true,
    } as Response);

    const entries = await client.listSites('access-token');

    expect(entries).toStrictEqual([
      { permissionLevel: 'siteOwner', siteUrl: 'sc-domain:example.com' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(SEARCH_CONSOLE_SITES_URL, {
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('returns an empty list when Google omits siteEntry', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({}), ok: true } as Response);

    await expect(client.listSites('access-token')).resolves.toStrictEqual([]);
  });

  it('raises a gateway error when Google rejects sites.list', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response);

    await expect(client.listSites('access-token')).rejects.toThrow(BadGatewayException);
  });

  it('queries Search Console performance rows', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({
        rows: [{ clicks: 3, ctr: 0.3, impressions: 10, keys: ['2026-06-01'], position: 2.5 }],
      }),
      ok: true,
    } as Response);

    const rows = await client.querySearchAnalytics('access-token', 'sc-domain:example.com', {
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [{ dimension: 'page', expression: '://example.com', operator: 'contains' }],
        },
      ],
      dimensions: ['date'],
      endDate: '2026-06-01',
      startDate: '2026-06-01',
    });

    expect(rows).toStrictEqual([
      { clicks: 3, ctr: 0.3, impressions: 10, keys: ['2026-06-01'], position: 2.5 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${SEARCH_CONSOLE_API_BASE_URL}/sites/sc-domain%3Aexample.com/searchAnalytics/query`,
      expect.objectContaining({
        body: expect.stringContaining('dimensionFilterGroups'),
        method: 'POST',
      }),
    );
  });
});
