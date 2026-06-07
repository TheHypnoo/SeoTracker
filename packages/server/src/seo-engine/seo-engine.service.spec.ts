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

jest.mock<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch', () => ({
  // Keep the real readBodyWithLimit / ResponseTooLargeError / SsrfBlockedError;
  // only the network call is stubbed.
  ...jest.requireActual<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch'),
  safeFetch: jest.fn(),
}));

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
      const values: Record<string, number | string> = {
        AUDIT_HTTP_TIMEOUT_MS: 1000,
        AUDIT_MAX_DEPTH: 2,
        AUDIT_MAX_LINKS: 10,
        AUDIT_MAX_PAGES: 3,
        AUDIT_SITEMAP_SAMPLE_MAX: 5,
        AUDIT_USER_AGENT: 'SEOTrackerTestBot/1.0',
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
      breakdown: {
        criticalRisk: { issueCodes: [], level: 'NONE', reasons: [] },
        topDeductions: [],
      },
      categoryScores: { TECHNICAL: 100 },
      crawlConfidenceScore: 80,
      criticalRisk: 'NONE',
      modelVersion: 'v2.0',
      pageScores: new Map([
        ['https://example.com', 100],
        ['https://example.com/about', 95],
      ]),
      score: 98,
      seoScore: 99,
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

  it('retries a transient homepage failure instead of marking the domain unreachable', async () => {
    jest
      .mocked(safeFetch)
      .mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(
        new Response('<html><head></head><body>ok</body></html>', {
          headers: { 'content-type': 'text/html' },
          status: 200,
        }),
      );
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(result.httpStatus).toBe(200);
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ issueCode: IssueCode.DOMAIN_UNREACHABLE }),
    );
  });

  it('folds blog issues and config-derived crawl limits into the audit result', async () => {
    jest.mocked(safeFetch).mockResolvedValueOnce(
      new Response('<html><head></head><body>post</body></html>', {
        headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' },
        status: 200,
      }),
    );
    jest.mocked(runBlogChecks).mockReturnValueOnce([
      {
        category: 'ON_PAGE' as never,
        issueCode: IssueCode.THIN_CONTENT,
        message: 'Thin content',
        severity: Severity.LOW,
      },
    ]);
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(result.issues).toContainEqual(
      expect.objectContaining({ issueCode: IssueCode.THIN_CONTENT }),
    );
    expect(crawlPages).toHaveBeenCalledWith(expect.objectContaining({ maxDepth: 2, maxPages: 3 }));
    expect(result.pages[0]).toMatchObject({ xRobotsTag: 'noindex' });
  });

  it('returns a generic unreachable issue when homepage fetch fails without SSRF blocking', async () => {
    jest.mocked(safeFetch).mockRejectedValueOnce(new Error('network down'));
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(result.issues).toStrictEqual([
      expect.objectContaining({
        issueCode: IssueCode.DOMAIN_UNREACHABLE,
        message: 'Domain unreachable: example.com',
      }),
    ]);
  });

  it('uses fallbacks for missing response URL and headers', async () => {
    // A binary body avoids Response's automatic text/plain content-type, so this
    // exercises the undefined contentType/url/header fallbacks (url='' too).
    jest
      .mocked(safeFetch)
      .mockResolvedValueOnce(
        new Response(
          new TextEncoder().encode(
            '<html><head><link rel="canonical" href="/canonical"></head><body></body></html>',
          ),
          { status: 200 },
        ),
      );
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(result.pages[0]).toMatchObject({
      canonicalUrl: 'https://example.com/canonical',
      contentType: undefined,
      robotsDirective: undefined,
      xRobotsTag: undefined,
    });
  });

  it('treats an oversized homepage body as unreachable (decompression-bomb guard)', async () => {
    // Content-Length declares far more than the 5 MiB cap, so readBodyWithLimit
    // rejects up front before buffering the body.
    jest.mocked(safeFetch).mockResolvedValueOnce(
      new Response('<html></html>', {
        headers: { 'content-length': String(50 * 1024 * 1024) },
        status: 200,
      }),
    );
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    expect(result.issues).toContainEqual(
      expect.objectContaining({ issueCode: IssueCode.DOMAIN_UNREACHABLE }),
    );
  });

  it('projects scored top deductions into the scoring telemetry event', async () => {
    jest.mocked(safeFetch).mockResolvedValueOnce(
      new Response('<html><head></head><body>ok</body></html>', {
        headers: { 'content-type': 'text/html' },
        status: 200,
      }),
    );
    jest.mocked(scoreAudit).mockReturnValueOnce({
      breakdown: {
        criticalRisk: { issueCodes: [], level: 'NONE', reasons: [] },
        topDeductions: [{ cappedDeduction: 7, issueCode: IssueCode.THIN_CONTENT }],
      },
      categoryScores: { TECHNICAL: 90 },
      crawlConfidenceScore: 80,
      criticalRisk: 'NONE',
      modelVersion: 'v2.0',
      pageScores: new Map([['https://example.com', 90]]),
      score: 90,
      seoScore: 91,
    } as never);
    const service = new SeoEngineService(configService as never);

    const result = await service.analyzeDomain('example.com');

    const scoring = result.engineTelemetry.find((event) => event.stage === 'scoring');
    expect(scoring?.details?.topDeductions).toStrictEqual([
      { issueCode: IssueCode.THIN_CONTENT, points: 7 },
    ]);
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
      [],
    );
  });
});
