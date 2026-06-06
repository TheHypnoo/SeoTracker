import { describe, expect, it } from '@jest/globals';
import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import { SCORE_CALIBRATION_FIXTURES } from './calibration-fixtures';
import { SCORE_REVIEW_MATRIX } from './score-diagnostics';
import { getIssueCategory, scoreAudit } from './scoring';
import type { SeoIssue } from './seo-engine.types';

describe('scoreAudit', () => {
  it('scores an unreachable domain as 0 with a blocking critical risk', () => {
    const issue: SeoIssue = {
      category: IssueCategory.TECHNICAL,
      issueCode: IssueCode.DOMAIN_UNREACHABLE,
      message: 'Domain unreachable: example.test',
      severity: Severity.CRITICAL,
    };

    const result = scoreAudit([issue], [], 'https://example.test/');

    expect(result.score).toBe(0);
    expect(result.seoScore).toBe(0);
    expect(result.breakdown.totalDeduction).toBe(100);
    expect(result.criticalRisk).toBe('BLOCKING');
    expect(Object.values(result.categoryScores)).toStrictEqual(
      Object.values(IssueCategory).map(() => 0),
    );
  });

  it('uses the score model category scores while keeping page scores page-scoped', () => {
    const issues: SeoIssue[] = [
      {
        category: IssueCategory.ON_PAGE,
        issueCode: IssueCode.MISSING_TITLE,
        message: 'Missing title',
        resourceUrl: 'https://example.test/a',
        severity: Severity.HIGH,
      },
      {
        category: IssueCategory.PERFORMANCE,
        issueCode: IssueCode.PAGE_TOO_HEAVY,
        message: 'Heavy page',
        resourceUrl: 'https://example.test/a',
        severity: Severity.MEDIUM,
      },
      {
        category: IssueCategory.MEDIA,
        issueCode: IssueCode.IMAGE_WITHOUT_ALT,
        message: 'Missing alt',
        resourceUrl: 'https://example.test/b',
        severity: Severity.LOW,
      },
    ];

    const result = scoreAudit(
      issues,
      [{ url: 'https://example.test/a' }, { url: 'https://example.test/b' }],
      'https://example.test/',
    );

    expect(result.categoryScores.ON_PAGE).toBe(89);
    expect(result.categoryScores.PERFORMANCE).toBe(98);
    expect(result.categoryScores.MEDIA).toBe(99);
    expect(result.pageScores.get('https://example.test/a')).toBe(89);
    expect(result.pageScores.get('https://example.test/b')).toBe(99);
  });

  it('uses issue definitions as the source of truth for category scores', () => {
    const issues: SeoIssue[] = [
      {
        category: IssueCategory.TECHNICAL,
        issueCode: IssueCode.MISSING_TITLE,
        message: 'wrong category in issue payload',
        severity: Severity.HIGH,
      },
    ];

    const result = scoreAudit(issues, [], 'https://example.test/');

    expect(result.categoryScores.ON_PAGE).toBe(89);
    expect(result.categoryScores.TECHNICAL).toBe(100);
  });

  it('zeros every page when a site-wide zero-score issue is present', () => {
    const result = scoreAudit(
      [
        {
          category: IssueCategory.TECHNICAL,
          issueCode: IssueCode.DOMAIN_UNREACHABLE,
          message: 'down',
          severity: Severity.CRITICAL,
        },
      ],
      [{ url: 'https://example.test/' }, { url: 'https://example.test/a' }],
      'https://example.test/',
    );

    expect([...result.pageScores.values()]).toStrictEqual([0, 0]);
  });

  it('groups repeated page issues and defaults resource-less issues to the homepage', () => {
    const result = scoreAudit(
      [
        {
          category: IssueCategory.ON_PAGE,
          issueCode: IssueCode.MISSING_TITLE,
          message: 'missing title 1',
          resourceUrl: 'https://example.test/a',
          severity: Severity.HIGH,
        },
        {
          category: IssueCategory.ON_PAGE,
          issueCode: IssueCode.MISSING_TITLE,
          message: 'missing title 2',
          resourceUrl: 'https://example.test/a',
          severity: Severity.HIGH,
        },
        {
          category: IssueCategory.MEDIA,
          issueCode: IssueCode.IMAGE_WITHOUT_ALT,
          message: 'missing alt',
          severity: Severity.LOW,
        },
      ],
      [
        { url: 'https://example.test/' },
        { url: 'https://example.test/a' },
        { url: 'https://example.test/no-issues' },
      ],
      'https://example.test/',
    );

    expect(result.pageScores.get('https://example.test/a')).toBeLessThan(100);
    expect(result.pageScores.get('https://example.test/')).toBe(99);
    expect(result.pageScores.get('https://example.test/no-issues')).toBe(100);
  });

  it('keeps cosmetic issues light in the public score', () => {
    const issues: SeoIssue[] = [
      {
        category: IssueCategory.ON_PAGE,
        issueCode: IssueCode.MISSING_OPEN_GRAPH,
        message: 'Missing OG',
        severity: Severity.LOW,
      },
      {
        category: IssueCategory.ON_PAGE,
        issueCode: IssueCode.MISSING_TWITTER_CARD,
        message: 'Missing Twitter Card',
        severity: Severity.LOW,
      },
      {
        category: IssueCategory.TECHNICAL,
        issueCode: IssueCode.MISSING_FAVICON,
        message: 'Missing favicon',
        severity: Severity.LOW,
      },
    ];

    const result = scoreAudit(issues, [{ url: 'https://example.test/' }], 'https://example.test/', [
      { key: 'crawl_confidence_score', valueNum: 90 },
    ]);

    expect(result.score).toBe(result.seoScore);
    expect(result.score).toBeGreaterThanOrEqual(96);
    expect(result.breakdown.topDeductions[0]?.falsePositiveRisk).toBe('HIGH');
    expect(result.criticalRisk).toBe('NONE');
  });

  it('marks noindex as a blocking risk while preserving the explanatory breakdown', () => {
    const result = scoreAudit(
      [
        {
          category: IssueCategory.CRAWLABILITY,
          issueCode: IssueCode.META_NOINDEX,
          message: 'noindex',
          resourceUrl: 'https://example.test/',
          severity: Severity.CRITICAL,
        },
      ],
      [{ url: 'https://example.test/' }],
      'https://example.test/',
      [{ key: 'crawl_confidence_score', valueNum: 95 }],
    );

    expect(result.criticalRisk).toBe('BLOCKING');
    expect(result.seoScore).toBeLessThanOrEqual(65);
    expect(result.breakdown.topDeductions[0]?.issueCode).toBe(IssueCode.META_NOINDEX);
  });

  it('discounts non-blocking page deductions when crawl confidence is low', () => {
    const issues: SeoIssue[] = [
      {
        category: IssueCategory.ON_PAGE,
        issueCode: IssueCode.THIN_CONTENT,
        message: 'thin',
        resourceUrl: 'https://example.test/',
        severity: Severity.LOW,
      },
      {
        category: IssueCategory.ON_PAGE,
        issueCode: IssueCode.MISSING_META_DESCRIPTION,
        message: 'missing meta',
        resourceUrl: 'https://example.test/',
        severity: Severity.MEDIUM,
      },
    ];

    const confident = scoreAudit(issues, [], 'https://example.test/', [
      { key: 'crawl_confidence_score', valueNum: 90 },
    ]);
    const lowConfidence = scoreAudit(issues, [], 'https://example.test/', [
      { key: 'crawl_confidence_score', valueNum: 32 },
    ]);

    expect(lowConfidence.breakdown.confidenceAdjustment.applied).toBe(true);
    expect(lowConfidence.seoScore).toBeGreaterThan(confident.seoScore);
  });

  it('calibrates representative fixtures against the active scoring model', () => {
    for (const fixture of SCORE_CALIBRATION_FIXTURES) {
      const result = scoreAudit(
        fixture.issues,
        fixture.pages,
        fixture.homepageUrl,
        fixture.metrics,
      );

      expect({
        criticalRisk: result.criticalRisk,
        seoScoreInRange: isInRange(result.seoScore, fixture.expected.seoScoreRange),
      }).toStrictEqual({
        criticalRisk: fixture.expected.criticalRisk,
        seoScoreInRange: true,
      });
    }
    expect(SCORE_CALIBRATION_FIXTURES.length).toBeGreaterThan(0);
  });
});

function isInRange(value: number, [min, max]: [number, number]): boolean {
  return value >= min && value <= max;
}

describe('score diagnostics matrix', () => {
  it('covers every IssueCode with review metadata for telemetry calibration', () => {
    expect(SCORE_REVIEW_MATRIX.map((entry) => entry.issueCode).toSorted()).toStrictEqual(
      Object.values(IssueCode).toSorted(),
    );
    expect(SCORE_REVIEW_MATRIX).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          falsePositiveRisk: 'HIGH',
          impactTier: 'COSMETIC',
          issueCode: IssueCode.MISSING_OPEN_GRAPH,
        }),
        expect.objectContaining({
          impactTier: 'BLOCKING',
          issueCode: IssueCode.META_NOINDEX,
        }),
      ]),
    );
  });
});

describe('getIssueCategory', () => {
  it('maps representative issue codes to SEO categories', () => {
    expect(getIssueCategory(IssueCode.MISSING_TITLE)).toBe(IssueCategory.ON_PAGE);
    expect(getIssueCategory(IssueCode.IMAGE_WITHOUT_ALT)).toBe(IssueCategory.MEDIA);
    expect(getIssueCategory(IssueCode.BROKEN_LINK)).toBe(IssueCategory.CRAWLABILITY);
    expect(getIssueCategory(IssueCode.PAGE_TOO_HEAVY)).toBe(IssueCategory.PERFORMANCE);
    expect(getIssueCategory(IssueCode.NO_HTTPS)).toBe(IssueCategory.TECHNICAL);
  });
});
