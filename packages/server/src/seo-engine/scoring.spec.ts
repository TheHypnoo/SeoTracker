import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import { getIssueCategory, scoreAudit, scoreForIssues } from './scoring';
import type { SeoIssue } from './seo-engine.types';

describe('scoreAudit', () => {
  it('scores an unreachable domain as 0 instead of applying a generic critical deduction', () => {
    const issue: SeoIssue = {
      category: IssueCategory.TECHNICAL,
      issueCode: IssueCode.DOMAIN_UNREACHABLE,
      message: 'Domain unreachable: example.test',
      severity: Severity.CRITICAL,
    };

    const result = scoreAudit([issue], [], 'https://example.test/');

    expect(result.score).toBe(0);
    expect(result.breakdown.totalDeduction).toBe(100);
    expect(result.breakdown.perSeverity.CRITICAL).toEqual({
      cappedDeduction: 100,
      rawDeduction: 100,
    });
    expect(Object.values(result.categoryScores)).toEqual(Object.values(IssueCategory).map(() => 0));
  });

  it('caps repeated deductions by severity and exposes raw vs capped totals', () => {
    const issues: SeoIssue[] = Array.from({ length: 10 }, (_, index) => ({
      category: IssueCategory.ON_PAGE,
      issueCode: IssueCode.MISSING_TITLE,
      message: `Missing title ${index}`,
      severity: Severity.HIGH,
    }));

    const result = scoreForIssues(issues);

    expect(result.breakdown.perSeverity.HIGH.rawDeduction).toBe(24);
    expect(result.breakdown.perSeverity.HIGH.cappedDeduction).toBe(24);
    expect(result.score).toBe(76);
  });

  it('calculates category and page scores while skipping site-level issues for page scores', () => {
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

    expect(result.categoryScores.ON_PAGE).toBe(88);
    expect(result.categoryScores.PERFORMANCE).toBe(95);
    expect(result.categoryScores.MEDIA).toBe(99);
    expect(result.pageScores.get('https://example.test/a')).toBe(88);
    expect(result.pageScores.get('https://example.test/b')).toBe(99);
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
