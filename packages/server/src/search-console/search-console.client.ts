import { BadGatewayException, Injectable } from '@nestjs/common';

import { SEARCH_CONSOLE_API_BASE_URL, SEARCH_CONSOLE_SITES_URL } from './search-console.constants';

export interface SearchConsoleSiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

export interface SearchConsoleSitesListResponse {
  siteEntry?: SearchConsoleSiteEntry[];
}

export type SearchConsoleDimension = 'date' | 'query' | 'page' | 'country' | 'device';
export type SearchConsoleFilterDimension =
  | Exclude<SearchConsoleDimension, 'date'>
  | 'searchAppearance';
export type SearchConsoleFilterOperator =
  | 'contains'
  | 'equals'
  | 'excludingRegex'
  | 'includingRegex'
  | 'notContains'
  | 'notEquals';

export interface SearchConsoleDimensionFilter {
  dimension: SearchConsoleFilterDimension;
  expression: string;
  operator?: SearchConsoleFilterOperator;
}

export interface SearchConsoleDimensionFilterGroup {
  filters: SearchConsoleDimensionFilter[];
  groupType?: 'and';
}

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsQueryResponse {
  rows?: SearchAnalyticsRow[];
}

@Injectable()
export class SearchConsoleClient {
  async listSites(accessToken: string): Promise<SearchConsoleSiteEntry[]> {
    const response = await fetch(SEARCH_CONSOLE_SITES_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new BadGatewayException(`Search Console sites.list failed (${response.status})`);
    }

    const payload = (await response.json()) as SearchConsoleSitesListResponse;
    return payload.siteEntry ?? [];
  }

  async querySearchAnalytics(
    accessToken: string,
    siteUrl: string,
    input: {
      startDate: string;
      endDate: string;
      dimensions: SearchConsoleDimension[];
      rowLimit?: number;
      startRow?: number;
      searchType?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
      dimensionFilterGroups?: SearchConsoleDimensionFilterGroup[];
    },
  ): Promise<SearchAnalyticsRow[]> {
    const url = `${SEARCH_CONSOLE_API_BASE_URL}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const response = await fetch(url, {
      body: JSON.stringify({
        dimensions: input.dimensions,
        dimensionFilterGroups: input.dimensionFilterGroups,
        endDate: input.endDate,
        rowLimit: input.rowLimit ?? 25_000,
        searchType: input.searchType ?? 'web',
        startDate: input.startDate,
        startRow: input.startRow ?? 0,
      }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Search Console searchAnalytics.query failed (${response.status})`,
      );
    }

    const payload = (await response.json()) as SearchAnalyticsQueryResponse;
    return payload.rows ?? [];
  }
}
