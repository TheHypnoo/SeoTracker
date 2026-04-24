import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import type { ScoreBreakdown, SeoIssue, SeoPageResult } from './seo-engine.types';

/**
 * Issue codes whose impact is "site-wide" rather than tied to one page; they
 * influence the overall score but are NOT counted against per-page scores.
 */
export const SITE_LEVEL_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  IssueCode.DOMAIN_UNREACHABLE,
  IssueCode.MISSING_ROBOTS,
  IssueCode.MISSING_SITEMAP,
  IssueCode.ROBOTS_DISALLOWS_ALL,
  IssueCode.SITEMAP_EMPTY,
  IssueCode.SITEMAP_INVALID,
  IssueCode.NO_HTTPS,
  IssueCode.MISSING_HSTS,
  IssueCode.MISSING_FAVICON,
  IssueCode.REDIRECT_CHAIN,
  IssueCode.AI_CRAWLERS_BLOCKED,
  IssueCode.SOFT_404,
  IssueCode.MIXED_CONTENT,
  IssueCode.MISSING_COMPRESSION,
  IssueCode.DOM_TOO_LARGE,
  IssueCode.PAGE_TOO_HEAVY,
]);

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  [Severity.CRITICAL]: 25,
  [Severity.HIGH]: 12,
  [Severity.MEDIUM]: 5,
  [Severity.LOW]: 1.5,
};

const SEVERITY_CAPS: Record<Severity, number> = {
  [Severity.CRITICAL]: 70,
  [Severity.HIGH]: 50,
  [Severity.MEDIUM]: 30,
  [Severity.LOW]: 20,
};

export function scoreForIssues(issues: SeoIssue[]): {
  score: number;
  breakdown: ScoreBreakdown;
} {
  const codeCounts = new Map<string, { severity: Severity; count: number }>();
  for (const issue of issues) {
    const entry = codeCounts.get(issue.issueCode);
    if (entry) {
      entry.count += 1;
    } else {
      codeCounts.set(issue.issueCode, { severity: issue.severity, count: 1 });
    }
  }

  const perSeverityRaw: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
  };
  for (const { severity, count } of codeCounts.values()) {
    const multiplier = Math.min(1 + 0.3 * (count - 1), 2);
    perSeverityRaw[severity] += SEVERITY_WEIGHTS[severity] * multiplier;
  }

  const perSeverity: ScoreBreakdown['perSeverity'] = {
    [Severity.CRITICAL]: { cappedDeduction: 0, rawDeduction: 0 },
    [Severity.HIGH]: { cappedDeduction: 0, rawDeduction: 0 },
    [Severity.MEDIUM]: { cappedDeduction: 0, rawDeduction: 0 },
    [Severity.LOW]: { cappedDeduction: 0, rawDeduction: 0 },
  };
  let totalDeduction = 0;
  for (const severity of Object.values(Severity)) {
    const raw = Math.round(perSeverityRaw[severity] * 10) / 10;
    const capped = Math.round(Math.min(raw, SEVERITY_CAPS[severity]) * 10) / 10;
    perSeverity[severity] = { cappedDeduction: capped, rawDeduction: raw };
    totalDeduction += capped;
  }

  return {
    breakdown: {
      perSeverity,
      totalDeduction: Math.round(totalDeduction * 10) / 10,
    },
    score: Math.max(0, Math.round(100 - totalDeduction)),
  };
}

export function scoreAudit(
  issues: SeoIssue[],
  pages: SeoPageResult[],
  homepageUrl: string,
): {
  score: number;
  categoryScores: Record<IssueCategory, number>;
  breakdown: ScoreBreakdown;
  pageScores: Map<string, number>;
} {
  const overall = scoreForIssues(issues);

  const categoryScores = Object.fromEntries(
    Object.values(IssueCategory).map((cat) => [
      cat,
      scoreForIssues(issues.filter((i) => i.category === cat)).score,
    ]),
  ) as Record<IssueCategory, number>;

  const issuesByPage = new Map<string, SeoIssue[]>();
  for (const issue of issues) {
    if (SITE_LEVEL_CODES.has(issue.issueCode)) {
      continue;
    }
    const target = issue.resourceUrl ?? homepageUrl;
    const list = issuesByPage.get(target);
    if (list) {
      list.push(issue);
    } else {
      issuesByPage.set(target, [issue]);
    }
  }
  const pageScores = new Map<string, number>();
  for (const page of pages) {
    const relevant = issuesByPage.get(page.url) ?? [];
    pageScores.set(page.url, scoreForIssues(relevant).score);
  }

  return {
    breakdown: overall.breakdown,
    categoryScores,
    pageScores,
    score: overall.score,
  };
}

export function getIssueCategory(issueCode: IssueCode): IssueCategory {
  switch (issueCode) {
    case IssueCode.MISSING_TITLE:
    case IssueCode.TITLE_TOO_SHORT:
    case IssueCode.TITLE_TOO_LONG:
    case IssueCode.MISSING_META_DESCRIPTION:
    case IssueCode.META_DESCRIPTION_TOO_SHORT:
    case IssueCode.META_DESCRIPTION_TOO_LONG:
    case IssueCode.MISSING_H1:
    case IssueCode.MULTIPLE_H1:
    case IssueCode.HEADING_HIERARCHY_SKIP:
    case IssueCode.MISSING_CANONICAL:
    case IssueCode.CANONICAL_MISMATCH:
    case IssueCode.CANONICAL_NOT_ABSOLUTE:
    case IssueCode.MULTIPLE_CANONICALS:
    case IssueCode.MISSING_OPEN_GRAPH:
    case IssueCode.MISSING_TWITTER_CARD:
    case IssueCode.MISSING_STRUCTURED_DATA:
    case IssueCode.INVALID_STRUCTURED_DATA:
    case IssueCode.STRUCTURED_DATA_MISSING_TYPE:
    case IssueCode.INVALID_HREFLANG:
    case IssueCode.DUPLICATE_CONTENT:
    case IssueCode.THIN_CONTENT:
    case IssueCode.MISSING_ARTICLE_SCHEMA:
    case IssueCode.STALE_CONTENT:
    case IssueCode.POOR_READABILITY:
    case IssueCode.SHORT_BLOG_POST:
    case IssueCode.MISSING_AUTHOR: {
      return IssueCategory.ON_PAGE;
    }
    case IssueCode.IMAGE_WITHOUT_ALT:
    case IssueCode.IMAGE_MISSING_DIMENSIONS: {
      return IssueCategory.MEDIA;
    }
    case IssueCode.MISSING_ROBOTS:
    case IssueCode.MISSING_SITEMAP:
    case IssueCode.BROKEN_LINK:
    case IssueCode.ROBOTS_DISALLOWS_ALL:
    case IssueCode.SITEMAP_EMPTY:
    case IssueCode.SITEMAP_INVALID:
    case IssueCode.REDIRECT_CHAIN:
    case IssueCode.META_NOINDEX:
    case IssueCode.META_NOFOLLOW:
    case IssueCode.AI_CRAWLERS_BLOCKED:
    case IssueCode.SOFT_404: {
      return IssueCategory.CRAWLABILITY;
    }
    case IssueCode.PAGE_TOO_HEAVY:
    case IssueCode.DOM_TOO_LARGE:
    case IssueCode.MISSING_COMPRESSION:
    case IssueCode.NO_LAZY_IMAGES: {
      return IssueCategory.PERFORMANCE;
    }
    case IssueCode.MISSING_VIEWPORT:
    case IssueCode.MISSING_LANG:
    case IssueCode.MIXED_CONTENT:
    case IssueCode.NO_HTTPS:
    case IssueCode.MISSING_HSTS:
    case IssueCode.MISSING_FAVICON:
    case IssueCode.DOMAIN_UNREACHABLE:
    default: {
      return IssueCategory.TECHNICAL;
    }
  }
}
