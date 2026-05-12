import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IssueCode, Severity } from '@seotracker/shared-types';

import { safeFetch, SsrfBlockedError } from '../common/utils/safe-fetch';
import { runBlogChecks } from './content-checks';
import { runCrossPageChecks } from './cross-page-checks';
import { analyzeHomepageHtml } from './homepage-html-analyzer';
import { buildLinkGraph } from './link-graph';
import { crawlPages } from './page-crawler';
import { scoreAudit } from './scoring';
import { SeoEngineService } from './seo-engine.service';
import { discoverSiteMetadata } from './sitemap-discovery';

jest.mock('../common/utils/safe-fetch', () => {
  class MockSsrfBlockedError extends Error {}
  return {
    SsrfBlockedError: MockSsrfBlockedError,
    safeFetch: jest.fn(),
  };
});

jest.mock('./homepage-html-analyzer', () => ({
  analyzeHomepageHtml: jest.fn(),
}));
jest.mock('./content-checks', () => ({
  runBlogChecks: jest.fn(),
}));
jest.mock('./sitemap-discovery', () => ({
  discoverSiteMetadata: jest.fn(),
}));
jest.mock('./link-graph', () => ({
  buildLinkGraph: jest.fn(),
}));
jest.mock('./page-crawler', () => ({
  crawlPages: jest.fn(),
}));
jest.mock('./cross-page-checks', () => ({
  runCrossPageChecks: jest.fn(),
}));
jest.mock('./scoring', () => ({
  getIssueCategory: jest.fn(() => 'TECHNICAL'),
  scoreAudit: jest.fn(),
}));

describe('SeoEngineService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, number> = {
        AUDIT_HTTP_TIMEOUT_MS: 1000,
        AUDIT_MAX_DEPTH: 2,
        AUDIT_MAX_LINKS: 10,
        AUDIT_MAX_PAGES: 3,
        AUDIT_SITEMAP_SAMPLE_MAX: 5,
      };
      return values[key];
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (analyzeHomepageHtml as jest.Mock).mockReturnValue({
      homepageText: 'Homepage text',
      issues: [],
      metrics: [{ key: 'title_length', valueNum: 12 }],
    });
    (runBlogChecks as jest.Mock).mockReturnValue([]);
    (discoverSiteMetadata as jest.Mock).mockResolvedValue({
      issues: [],
      metrics: [{ key: 'sitemap_urls', valueNum: 1 }],
      pages: [{ statusCode: 200, url: 'https://example.com/robots.txt' }],
      sitemapUrls: ['https://example.com/sitemap.xml'],
    });
    (buildLinkGraph as jest.Mock).mockReturnValue({
      crawlCandidateCount: 1,
      depth1Selected: ['https://example.com/about'],
      externalLinks: ['https://external.test'],
      homepageKey: 'https://example.com/',
      metrics: [{ key: 'internal_links', valueNum: 1 }],
      remainingInternal: [],
    });
    (crawlPages as jest.Mock).mockResolvedValue({
      issues: [],
      metrics: [{ key: 'crawled_pages', valueNum: 1 }],
      pageTexts: [{ text: 'About text', url: 'https://example.com/about' }],
      pages: [{ statusCode: 200, url: 'https://example.com/about' }],
      totalAnalyzed: 2,
    });
    (runCrossPageChecks as jest.Mock).mockReturnValue({
      issues: [],
      metrics: [{ key: 'duplicate_groups', valueNum: 0 }],
    });
    (scoreAudit as jest.Mock).mockReturnValue({
      breakdown: { penalties: [] },
      categoryScores: { TECHNICAL: 100 },
      pageScores: new Map([
        ['https://example.com', 100],
        ['https://example.com/about', 95],
      ]),
      score: 98,
    });
  });

  it('coordinates homepage analysis, discovery, crawling and scoring', async () => {
    (safeFetch as jest.Mock).mockResolvedValueOnce(
      new Response('<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>', {
        headers: { 'content-type': 'text/html' },
        status: 200,
      }),
    );
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com', { maxDepth: 1, maxPages: 2 });

    expect(safeFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ headers: { 'User-Agent': expect.any(String) } }),
    );
    expect(discoverSiteMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ hasFaviconLink: true, sitemapSampleMax: 5 }),
    );
    expect(crawlPages).toHaveBeenCalledWith(expect.objectContaining({ maxDepth: 1, maxPages: 2 }));
    expect(runCrossPageChecks).toHaveBeenCalledWith({
      pageTexts: [
        { text: 'Homepage text', url: 'https://example.com' },
        { text: 'About text', url: 'https://example.com/about' },
      ],
    });
    expect(result).toMatchObject({
      httpStatus: 200,
      score: 98,
      pages: [
        { score: 100, url: 'https://example.com' },
        { url: 'https://example.com/robots.txt' },
        { score: 95, url: 'https://example.com/about' },
      ],
    });
    expect(result.metrics).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'crawl_confidence_score', valueNum: expect.any(Number) }),
        expect.objectContaining({ key: 'crawl_confidence_level', valueText: expect.any(String) }),
      ]),
    );
  });

  it('returns a critical unreachable issue when the homepage fetch is blocked', async () => {
    (safeFetch as jest.Mock).mockRejectedValueOnce(new SsrfBlockedError('blocked'));
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(result.issues).toStrictEqual([
      expect.objectContaining({
        issueCode: IssueCode.DOMAIN_UNREACHABLE,
        message: 'Domain redirected to a blocked host: example.com',
        severity: Severity.CRITICAL,
      }),
    ]);
    expect(scoreAudit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ issueCode: IssueCode.DOMAIN_UNREACHABLE }),
      ]),
      [],
      'https://example.com',
    );
  });
});
