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
});

function statusFor(rows: ReturnType<typeof buildIndexabilityMatrix>, url: string) {
  return rows.find((row) => row.url === url)?.indexabilityStatus;
}
