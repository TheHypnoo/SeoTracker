import { describe, expect, it } from '@jest/globals';
import { IndexabilityStatus, IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import { buildIndexabilityMatrix } from './indexability-analyzer';

describe('buildIndexabilityMatrix', () => {
  it('classifies indexable pages', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [{ source: 'homepage', statusCode: 200, url: 'https://example.test/' }],
      sitemapUrls: ['https://example.test/'],
    });

    expect(rows[0]).toMatchObject({
      indexabilityStatus: IndexabilityStatus.INDEXABLE,
      sitemapIncluded: true,
      source: 'homepage',
    });
  });

  it('classifies noindex, canonicalized, private, http error and sitemap-only URLs', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          robotsDirective: 'noindex,follow',
          source: 'crawl',
          statusCode: 200,
          url: 'https://example.test/noindex',
        },
        {
          canonicalUrl: 'https://example.test/master',
          source: 'crawl',
          statusCode: 200,
          url: 'https://example.test/duplicate',
        },
        { source: 'crawl', statusCode: 500, url: 'https://example.test/broken' },
        { source: 'crawl', statusCode: 200, url: 'https://example.test/settings' },
      ],
      sitemapUrls: ['https://example.test/from-sitemap'],
    });

    expect(statusFor(rows, 'https://example.test/noindex')).toBe(IndexabilityStatus.NOINDEX);
    expect(statusFor(rows, 'https://example.test/duplicate')).toBe(
      IndexabilityStatus.CANONICALIZED,
    );
    expect(statusFor(rows, 'https://example.test/broken')).toBe(IndexabilityStatus.HTTP_ERROR);
    expect(statusFor(rows, 'https://example.test/settings')).toBe(
      IndexabilityStatus.PRIVATE_EXPECTED,
    );
    expect(statusFor(rows, 'https://example.test/from-sitemap')).toBe(IndexabilityStatus.UNKNOWN);
  });

  it('merges duplicate inspections and prefers stronger sources', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          source: 'head',
          statusCode: 200,
          url: 'https://example.test/page#fragment',
          xRobotsTag: 'noindex',
        },
        {
          canonicalUrl: 'https://example.test/page',
          robotsDirective: 'index,follow',
          source: 'crawl',
          statusCode: 204,
          url: 'https://example.test/page',
        },
      ],
      sitemapUrls: ['https://example.test/page'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      canonicalUrl: 'https://example.test/page',
      robotsDirective: 'index,follow',
      sitemapIncluded: true,
      source: 'crawl',
      statusCode: 204,
      xRobotsTag: 'noindex',
    });
  });

  it('classifies sitemap-only private URLs separately from public unknown URLs', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [],
      sitemapUrls: ['https://example.test/account', 'https://example.test/blog/post'],
    });

    expect(statusFor(rows, 'https://example.test/account')).toBe(
      IndexabilityStatus.PRIVATE_EXPECTED,
    );
    expect(statusFor(rows, 'https://example.test/blog/post')).toBe(IndexabilityStatus.UNKNOWN);
  });

  it('classifies unknown crawled pages with no status information', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [{ source: 'discovered', url: 'https://example.test/unknown' }],
      sitemapUrls: [],
    });

    expect(rows[0]?.indexabilityStatus).toBe(IndexabilityStatus.UNKNOWN);
    expect(rows[0]?.evidence.reason).toBe(
      'No hay suficiente información para clasificar esta URL.',
    );
  });

  it('marks URLs as blocked when robots disallows all', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [
        {
          category: IssueCategory.CRAWLABILITY,
          issueCode: IssueCode.ROBOTS_DISALLOWS_ALL,
          message: 'blocked',
          severity: Severity.CRITICAL,
        },
      ],
      pages: [{ source: 'homepage', statusCode: 200, url: 'https://example.test/' }],
      sitemapUrls: [],
    });

    expect(rows[0]?.indexabilityStatus).toBe(IndexabilityStatus.BLOCKED_BY_ROBOTS);
  });

  it('sorts the homepage first even when it is encountered on the right side', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        { source: 'crawl', statusCode: 200, url: 'https://example.test/z-last' },
        { source: 'homepage', statusCode: 200, url: 'https://example.test/' },
      ],
      sitemapUrls: [],
    });

    expect(rows.map((row) => row.url)).toStrictEqual([
      'https://example.test/',
      'https://example.test/z-last',
    ]);
  });

  it('prefers homepage inspections and merges sitemap fallback evidence', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          source: 'sitemap',
          statusCode: undefined,
          url: 'https://example.test/',
          xRobotsTag: 'noindex',
        },
        {
          robotsDirective: 'index,follow',
          source: 'homepage',
          statusCode: 200,
          url: 'https://example.test/',
        },
      ],
      sitemapUrls: [],
    });

    expect(rows[0]).toMatchObject({
      source: 'homepage',
      statusCode: 200,
      xRobotsTag: 'noindex',
    });
  });

  it('keeps the left inspection when it has the stronger source rank', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          robotsDirective: 'index,follow',
          source: 'homepage',
          statusCode: 200,
          url: 'https://example.test/',
        },
        {
          canonicalUrl: 'https://example.test/',
          source: 'sitemap',
          statusCode: undefined,
          url: 'https://example.test/',
          xRobotsTag: 'none',
        },
      ],
      sitemapUrls: ['https://example.test/'],
    });

    expect(rows[0]).toMatchObject({
      canonicalUrl: 'https://example.test/',
      source: 'homepage',
      statusCode: 200,
      xRobotsTag: 'none',
    });
  });

  it('prefers sitemap inspections over unknown discovered sources when merging', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          source: 'discovered',
          statusCode: undefined,
          url: 'https://example.test/from-sitemap',
          xRobotsTag: 'noindex',
        },
        {
          canonicalUrl: 'https://example.test/from-sitemap',
          source: 'sitemap',
          statusCode: 200,
          url: 'https://example.test/from-sitemap',
        },
      ],
      sitemapUrls: [],
    });

    expect(rows[0]).toMatchObject({
      canonicalUrl: 'https://example.test/from-sitemap',
      source: 'sitemap',
      statusCode: 200,
      xRobotsTag: 'noindex',
    });
  });

  it('keeps the preferred x-robots tag when present during merge', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          source: 'discovered',
          statusCode: 200,
          url: 'https://example.test/robots',
        },
        {
          source: 'sitemap',
          statusCode: 200,
          url: 'https://example.test/robots',
          xRobotsTag: 'none',
        },
      ],
      sitemapUrls: [],
    });

    expect(rows[0]?.xRobotsTag).toBe('none');
  });

  it('keeps missing status codes undefined when both merged inspections lack one', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        { source: 'discovered', statusCode: undefined, url: 'https://example.test/unknown' },
        { source: 'sitemap', statusCode: undefined, url: 'https://example.test/unknown' },
      ],
      sitemapUrls: [],
    });

    expect(rows[0]?.statusCode).toBeUndefined();
  });

  it('uses x-robots-tag noindex and unknown status zero branches', () => {
    const rows = buildIndexabilityMatrix({
      homepageUrl: 'https://example.test/',
      issues: [],
      pages: [
        {
          source: 'crawl',
          statusCode: 200,
          url: 'https://example.test/x-robots',
          xRobotsTag: 'noindex',
        },
        {
          source: 'crawl',
          statusCode: 0,
          url: 'https://example.test/status-zero',
        },
      ],
      sitemapUrls: [],
    });

    expect(statusFor(rows, 'https://example.test/x-robots')).toBe(IndexabilityStatus.NOINDEX);
    expect(statusFor(rows, 'https://example.test/status-zero')).toBe(IndexabilityStatus.UNKNOWN);
  });
});

function statusFor(rows: ReturnType<typeof buildIndexabilityMatrix>, url: string) {
  return rows.find((row) => row.url === url)?.indexabilityStatus;
}
