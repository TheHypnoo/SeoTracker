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

jest.mock<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch', () => {
  class MockSsrfBlockedError extends Error {
    override name = 'MockSsrfBlockedError';
  }
  return {
    SsrfBlockedError: MockSsrfBlockedError,
    safeFetch: jest.fn(),
  };
});

jest.mock<typeof import('./homepage-html-analyzer')>('./homepage-html-analyzer', () => ({
  analyzeHomepageHtml: jest.fn(),
}));
jest.mock<typeof import('./content-checks')>('./content-checks', () => ({
  runBlogChecks: jest.fn(),
}));
jest.mock<typeof import('./sitemap-discovery')>('./sitemap-discovery', () => ({
  discoverSiteMetadata: jest.fn(),
}));
jest.mock<typeof import('./link-graph')>('./link-graph', () => ({
  buildLinkGraph: jest.fn(),
}));
jest.mock<typeof import('./page-crawler')>('./page-crawler', () => ({
  crawlPages: jest.fn(),
}));
jest.mock<typeof import('./cross-page-checks')>('./cross-page-checks', () => ({
  runCrossPageChecks: jest.fn(),
}));
jest.mock<typeof import('./scoring')>('./scoring', () => ({
  getIssueCategory: jest.fn(() => 'TECHNICAL'),
  scoreAudit: jest.fn(),
}));

function expectCoordinatedAnalysis(result: Awaited<ReturnType<SeoEngineService['analyzeDomain']>>) {
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
    metrics: expect.arrayContaining([
      expect.objectContaining({ key: 'crawl_confidence_score', valueNum: expect.any(Number) }),
      expect.objectContaining({ key: 'crawl_confidence_level', valueText: expect.any(String) }),
    ]),
    score: 98,
    pages: [
      { score: 100, url: 'https://example.com' },
      { url: 'https://example.com/robots.txt' },
      { score: 95, url: 'https://example.com/about' },
    ],
  });
}

describe('seoEngineService', () => {
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
    jest.mocked(analyzeHomepageHtml).mockReturnValue({
      homepageText: 'Homepage text',
      issues: [],
      metrics: [{ key: 'title_length', valueNum: 12 }],
    });
    jest.mocked(runBlogChecks).mockReturnValue([]);
    jest.mocked(discoverSiteMetadata).mockResolvedValue({
      issues: [],
      metrics: [{ key: 'sitemap_urls', valueNum: 1 }],
      pages: [{ statusCode: 200, url: 'https://example.com/robots.txt' }],
      sitemapUrls: ['https://example.com/sitemap.xml'],
    });
    jest.mocked(buildLinkGraph).mockReturnValue({
      crawlCandidateCount: 1,
      depth1Selected: ['https://example.com/about'],
      externalLinks: ['https://external.test'],
      homepageKey: 'https://example.com/',
      metrics: [{ key: 'internal_links', valueNum: 1 }],
      remainingInternal: [],
    });
    jest.mocked(crawlPages).mockResolvedValue({
      issues: [],
      metrics: [{ key: 'crawled_pages', valueNum: 1 }],
      pageTexts: [{ text: 'About text', url: 'https://example.com/about' }],
      pages: [{ statusCode: 200, url: 'https://example.com/about' }],
      totalAnalyzed: 2,
    });
    jest.mocked(runCrossPageChecks).mockReturnValue({
      issues: [],
      metrics: [{ key: 'duplicate_groups', valueNum: 0 }],
    });
    jest.mocked(scoreAudit).mockReturnValue({
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
    jest.mocked(safeFetch).mockResolvedValueOnce(
      new Response('<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>', {
        headers: { 'content-type': 'text/html' },
        status: 200,
      }),
    );
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com', { maxDepth: 1, maxPages: 2 });

    expectCoordinatedAnalysis(result);
  });

  it('returns a critical unreachable issue when the homepage fetch is blocked', async () => {
    jest.mocked(safeFetch).mockRejectedValueOnce(new SsrfBlockedError('blocked'));
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
