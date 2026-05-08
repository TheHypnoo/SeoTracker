import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

export type IssueScoreScope = 'site' | 'page';

export type IssueDefinition = {
  category: IssueCategory;
  defaultSeverity: Severity;
  scoreScope: IssueScoreScope;
  baseDeduction: number;
  repeatIncrement: number;
  maxDeduction: number;
  zeroScore?: boolean;
};

export const ISSUE_DEFINITIONS: Record<IssueCode, IssueDefinition> = {
  [IssueCode.AI_CRAWLERS_BLOCKED]: site(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 3, 0, 3),
  [IssueCode.BROKEN_LINK]: page(IssueCategory.CRAWLABILITY, Severity.LOW, 2, 1, 15),
  [IssueCode.CANONICAL_MISMATCH]: page(IssueCategory.ON_PAGE, Severity.LOW, 4, 1.5, 15),
  [IssueCode.CANONICAL_NOT_ABSOLUTE]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 12),
  [IssueCode.DOM_TOO_LARGE]: site(IssueCategory.PERFORMANCE, Severity.LOW, 3, 0, 3),
  [IssueCode.DOMAIN_UNREACHABLE]: {
    ...site(IssueCategory.TECHNICAL, Severity.CRITICAL, 100, 0, 100),
    zeroScore: true,
  },
  [IssueCode.DUPLICATE_CONTENT]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 7, 2, 25),
  [IssueCode.HEADING_HIERARCHY_SKIP]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 10),
  [IssueCode.IMAGE_MISSING_DIMENSIONS]: page(IssueCategory.MEDIA, Severity.LOW, 2, 0.75, 10),
  [IssueCode.IMAGE_WITHOUT_ALT]: page(IssueCategory.MEDIA, Severity.LOW, 2, 0.75, 12),
  [IssueCode.INVALID_HREFLANG]: page(IssueCategory.ON_PAGE, Severity.LOW, 4, 1, 15),
  [IssueCode.INVALID_STRUCTURED_DATA]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 6, 1.5, 18),
  [IssueCode.META_DESCRIPTION_TOO_LONG]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.META_DESCRIPTION_TOO_SHORT]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.META_NOINDEX]: page(IssueCategory.CRAWLABILITY, Severity.HIGH, 18, 4, 45),
  [IssueCode.META_NOFOLLOW]: page(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 7, 2, 20),
  [IssueCode.MISSING_ARTICLE_SCHEMA]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 10),
  [IssueCode.MISSING_AUTHOR]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 10),
  [IssueCode.MISSING_CANONICAL]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 7, 2, 20),
  [IssueCode.MISSING_COMPRESSION]: site(IssueCategory.PERFORMANCE, Severity.MEDIUM, 5, 0, 5),
  [IssueCode.MISSING_FAVICON]: site(IssueCategory.TECHNICAL, Severity.LOW, 1, 0, 1),
  [IssueCode.MISSING_H1]: page(IssueCategory.ON_PAGE, Severity.HIGH, 12, 3, 30),
  [IssueCode.MISSING_HSTS]: site(IssueCategory.TECHNICAL, Severity.LOW, 2, 0, 2),
  [IssueCode.MISSING_LANG]: page(IssueCategory.TECHNICAL, Severity.LOW, 2, 0.75, 8),
  [IssueCode.MISSING_META_DESCRIPTION]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 7, 2, 22),
  [IssueCode.MISSING_OPEN_GRAPH]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.MISSING_ROBOTS]: site(IssueCategory.CRAWLABILITY, Severity.LOW, 3, 0, 3),
  [IssueCode.MISSING_SITEMAP]: site(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 6, 0, 6),
  [IssueCode.MISSING_STRUCTURED_DATA]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 10),
  [IssueCode.MISSING_TITLE]: page(IssueCategory.ON_PAGE, Severity.HIGH, 14, 4, 35),
  [IssueCode.MISSING_TWITTER_CARD]: page(IssueCategory.ON_PAGE, Severity.LOW, 1, 0.5, 5),
  [IssueCode.MISSING_VIEWPORT]: page(IssueCategory.TECHNICAL, Severity.HIGH, 10, 2, 25),
  [IssueCode.MIXED_CONTENT]: site(IssueCategory.TECHNICAL, Severity.MEDIUM, 8, 0, 8),
  [IssueCode.MULTIPLE_CANONICALS]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 8, 2, 20),
  [IssueCode.MULTIPLE_H1]: page(IssueCategory.ON_PAGE, Severity.MEDIUM, 5, 1.5, 15),
  [IssueCode.NO_HTTPS]: site(IssueCategory.TECHNICAL, Severity.HIGH, 20, 0, 20),
  [IssueCode.NO_LAZY_IMAGES]: site(IssueCategory.PERFORMANCE, Severity.LOW, 2, 0, 2),
  [IssueCode.PAGE_TOO_HEAVY]: site(IssueCategory.PERFORMANCE, Severity.MEDIUM, 6, 0, 6),
  [IssueCode.POOR_READABILITY]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.REDIRECT_CHAIN]: site(IssueCategory.CRAWLABILITY, Severity.LOW, 2, 0, 2),
  [IssueCode.ROBOTS_DISALLOWS_ALL]: site(IssueCategory.CRAWLABILITY, Severity.CRITICAL, 35, 0, 35),
  [IssueCode.SHORT_BLOG_POST]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 12),
  [IssueCode.SITEMAP_EMPTY]: site(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 5, 0, 5),
  [IssueCode.SITEMAP_INVALID]: site(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 5, 0, 5),
  [IssueCode.SOFT_404]: site(IssueCategory.CRAWLABILITY, Severity.MEDIUM, 8, 0, 8),
  [IssueCode.STALE_CONTENT]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.STRUCTURED_DATA_MISSING_TYPE]: page(IssueCategory.ON_PAGE, Severity.LOW, 4, 1, 12),
  [IssueCode.THIN_CONTENT]: page(IssueCategory.ON_PAGE, Severity.LOW, 3, 1, 15),
  [IssueCode.TITLE_TOO_LONG]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
  [IssueCode.TITLE_TOO_SHORT]: page(IssueCategory.ON_PAGE, Severity.LOW, 2, 0.75, 8),
};

function site(
  category: IssueCategory,
  defaultSeverity: Severity,
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
): IssueDefinition {
  return {
    baseDeduction,
    category,
    defaultSeverity,
    maxDeduction,
    repeatIncrement,
    scoreScope: 'site',
  };
}

function page(
  category: IssueCategory,
  defaultSeverity: Severity,
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
): IssueDefinition {
  return {
    baseDeduction,
    category,
    defaultSeverity,
    maxDeduction,
    repeatIncrement,
    scoreScope: 'page',
  };
}

export function getIssueDefinition(issueCode: IssueCode): IssueDefinition {
  return ISSUE_DEFINITIONS[issueCode];
}
