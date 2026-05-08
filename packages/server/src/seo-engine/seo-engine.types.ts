import {
  IndexabilityStatus,
  IssueCategory,
  IssueCode,
  SeoActionEffort,
  SeoActionImpact,
  Severity,
} from '@seotracker/shared-types';

// Optional fields are intentionally typed as `field?: T | undefined` (not
// `field?: T`) because the codebase often constructs these via spread or
// destructuring of upstream optionals; under `exactOptionalPropertyTypes` the
// stricter form would refuse `{ field: undefined }` even when semantically
// equivalent to omitting the key.

export type SeoIssue = {
  issueCode: IssueCode;
  category: IssueCategory;
  severity: Severity;
  message: string;
  resourceUrl?: string | undefined;
  meta?: Record<string, unknown> | undefined;
};

export type SeoMetric = {
  key: string;
  valueNum?: number | undefined;
  valueText?: string | undefined;
};

export type SeoPageSource = 'homepage' | 'crawl' | 'head' | 'sitemap' | 'probe';

export type SeoPageResult = {
  url: string;
  statusCode?: number | undefined;
  responseMs?: number | undefined;
  contentType?: string | undefined;
  score?: number | undefined;
  source?: SeoPageSource | undefined;
  canonicalUrl?: string | undefined;
  robotsDirective?: string | undefined;
  xRobotsTag?: string | undefined;
};

export type SeoUrlInspection = {
  url: string;
  source: SeoPageSource;
  statusCode?: number | undefined;
  indexabilityStatus: IndexabilityStatus;
  canonicalUrl?: string | undefined;
  robotsDirective?: string | undefined;
  xRobotsTag?: string | undefined;
  sitemapIncluded: boolean;
  evidence: Record<string, unknown>;
};

export type SeoActionItem = {
  issueCode: IssueCode;
  category: IssueCategory;
  severity: Severity;
  priorityScore: number;
  impact: SeoActionImpact;
  effort: SeoActionEffort;
  scoreImpactPoints: number;
  occurrences: number;
  affectedPagesCount: number;
  affectedPages: string[];
  evidenceSummary: string;
  priorityReason: string;
  recommendedAction: string;
  remediationPrompt: string;
};

export type ScoreBreakdown = {
  perSeverity: Record<Severity, { rawDeduction: number; cappedDeduction: number }>;
  totalDeduction: number;
};

export type SeoAuditResult = {
  httpStatus?: number | undefined;
  responseMs?: number | undefined;
  score: number;
  categoryScores: Record<IssueCategory, number>;
  scoreBreakdown: ScoreBreakdown;
  issues: SeoIssue[];
  metrics: SeoMetric[];
  pages: SeoPageResult[];
  urlInspections: SeoUrlInspection[];
};
