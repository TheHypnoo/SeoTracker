import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import { getScoreReviewEntry } from './score-diagnostics';
import { getIssueDefinition, ISSUE_DEFINITIONS } from './issue-definitions';
import type {
  CriticalRiskLevel,
  ScoreBreakdown,
  ScoreDeduction,
  SeoIssue,
  SeoMetric,
  SeoPageResult,
} from './seo-engine.types';

/**
 * Issue codes whose impact is "site-wide" rather than tied to one page; they
 * influence the overall score but are NOT counted against per-page scores.
 */
export const SITE_LEVEL_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(
  Object.entries(ISSUE_DEFINITIONS)
    .filter(([, definition]) => definition.scoreScope === 'site')
    .map(([code]) => code as IssueCode),
);

const ZERO_SCORE_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(
  Object.entries(ISSUE_DEFINITIONS)
    .filter(([, definition]) => definition.zeroScore)
    .map(([code]) => code as IssueCode),
);

export const ACTIVE_SCORE_MODEL_VERSION = 'v2.0';

export function scoreAudit(
  issues: SeoIssue[],
  pages: SeoPageResult[],
  homepageUrl: string,
  metrics: SeoMetric[] = [],
): {
  score: number;
  categoryScores: Record<IssueCategory, number>;
  breakdown: ScoreBreakdown;
  pageScores: Map<string, number>;
  modelVersion: string;
  seoScore: number;
  crawlConfidenceScore: number | null;
  criticalRisk: CriticalRiskLevel;
} {
  // Resolve crawl-confidence context once; it is identical for every page and
  // the homepage breakdown, so there is no need to re-scan metrics per page.
  const confidence = resolveConfidence(metrics);
  const breakdown = buildScoreBreakdown(issues, homepageUrl, confidence);
  const categoryScores = Object.fromEntries(
    Object.values(IssueCategory).map((cat) => [
      cat,
      breakdown.categoryDeductions[cat]?.score ?? 100,
    ]),
  ) as Record<IssueCategory, number>;

  const hasSiteWideZeroScoreIssue = issues.some(
    (issue) => SITE_LEVEL_CODES.has(issue.issueCode) && ZERO_SCORE_CODES.has(issue.issueCode),
  );
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
    if (hasSiteWideZeroScoreIssue) {
      pageScores.set(page.url, 0);
      continue;
    }
    const relevant = issuesByPage.get(page.url) ?? [];
    pageScores.set(page.url, computePageScore(relevant, page.url, confidence));
  }

  return {
    breakdown,
    categoryScores,
    crawlConfidenceScore: breakdown.crawlConfidenceScore,
    criticalRisk: breakdown.criticalRisk.level,
    modelVersion: ACTIVE_SCORE_MODEL_VERSION,
    pageScores,
    score: breakdown.seoScore,
    seoScore: breakdown.seoScore,
  };
}

type ConfidenceContext = {
  crawlConfidenceScore: number | null;
  confidenceMultiplier: number;
  lowConfidence: boolean;
};

function resolveConfidence(metrics: SeoMetric[]): ConfidenceContext {
  const crawlConfidenceScore = extractMetricNumber(metrics, 'crawl_confidence_score');
  return {
    confidenceMultiplier: confidenceDeductionMultiplier(crawlConfidenceScore),
    crawlConfidenceScore,
    lowConfidence: crawlConfidenceScore !== null && crawlConfidenceScore < 55,
  };
}

/** Capped total deduction → 0–100 score, the single source of the score math. */
function seoScoreFromDeductions(
  deductions: ScoreDeduction[],
  criticalRisk: CriticalRiskLevel,
): {
  totalDeduction: number;
  seoScore: number;
} {
  const totalDeduction = round1(
    Math.min(
      deductions.reduce((total, deduction) => total + deduction.cappedDeduction, 0),
      criticalRisk === 'BLOCKING' ? 100 : 90,
    ),
  );
  return { seoScore: Math.max(0, Math.round(100 - totalDeduction)), totalDeduction };
}

/**
 * Lightweight per-page scorer: shares the deduction + cap math with
 * buildScoreBreakdown but skips the category/scope/top-deduction breakdown that
 * page rows never use.
 */
function computePageScore(
  issues: SeoIssue[],
  homepageUrl: string,
  confidence: ConfidenceContext,
): number {
  if (issues.some((issue) => ZERO_SCORE_CODES.has(issue.issueCode))) {
    return 0;
  }
  const deductions = buildScoreDeductions({
    confidenceMultiplier: confidence.confidenceMultiplier,
    homepageUrl,
    issues,
    lowConfidence: confidence.lowConfidence,
  });
  return seoScoreFromDeductions(deductions, buildCriticalRisk(issues).level).seoScore;
}

function buildScoreBreakdown(
  issues: SeoIssue[],
  homepageUrl: string,
  confidence: ConfidenceContext,
): ScoreBreakdown {
  const { crawlConfidenceScore, confidenceMultiplier, lowConfidence } = confidence;
  const criticalRisk = buildCriticalRisk(issues);

  if (issues.some((issue) => ZERO_SCORE_CODES.has(issue.issueCode))) {
    const deductions = buildScoreDeductions({
      confidenceMultiplier: 1,
      homepageUrl,
      issues,
      lowConfidence: false,
    });
    return {
      categoryDeductions: zeroCategoryDeductions(),
      confidenceAdjustment: {
        applied: false,
        multiplier: 1,
        reason: null,
      },
      crawlConfidenceScore,
      criticalRisk,
      deductions,
      modelVersion: ACTIVE_SCORE_MODEL_VERSION,
      rawSeoScore: 0,
      rawTotalDeduction: 100,
      scopeDeductions: { page: 0, site: 100 },
      seoScore: 0,
      topDeductions: deductions.slice(0, 5),
      totalDeduction: 100,
    };
  }

  const deductions = buildScoreDeductions({
    confidenceMultiplier,
    homepageUrl,
    issues,
    lowConfidence,
  });
  const rawTotalDeduction = round1(
    deductions.reduce((total, deduction) => total + deduction.rawDeduction, 0),
  );
  const { totalDeduction, seoScore } = seoScoreFromDeductions(deductions, criticalRisk.level);
  const rawSeoScore = Math.max(0, Math.round(100 - rawTotalDeduction));
  const categoryDeductions = buildCategoryDeductions(deductions);
  const scopeDeductions = {
    page: round1(
      deductions
        .filter((deduction) => deduction.scope === 'page')
        .reduce((total, deduction) => total + deduction.cappedDeduction, 0),
    ),
    site: round1(
      deductions
        .filter((deduction) => deduction.scope === 'site')
        .reduce((total, deduction) => total + deduction.cappedDeduction, 0),
    ),
  };

  return {
    categoryDeductions,
    confidenceAdjustment: {
      applied: lowConfidence,
      multiplier: confidenceMultiplier,
      reason: lowConfidence
        ? `Crawl confidence ${crawlConfidenceScore}/100: reduced non-blocking page deductions.`
        : null,
    },
    crawlConfidenceScore,
    criticalRisk,
    deductions,
    modelVersion: ACTIVE_SCORE_MODEL_VERSION,
    rawSeoScore,
    rawTotalDeduction,
    scopeDeductions,
    seoScore,
    topDeductions: deductions
      .toSorted((left, right) => right.cappedDeduction - left.cappedDeduction)
      .slice(0, 5),
    totalDeduction,
  };
}

function buildScoreDeductions(input: {
  issues: SeoIssue[];
  homepageUrl: string;
  lowConfidence: boolean;
  confidenceMultiplier: number;
}): ScoreDeduction[] {
  const grouped = new Map<
    IssueCode,
    {
      severity: Severity;
      count: number;
      resources: Set<string>;
    }
  >();
  for (const issue of input.issues) {
    const severity = issue.severity ?? getIssueDefinition(issue.issueCode).defaultSeverity;
    const existing = grouped.get(issue.issueCode);
    if (existing) {
      existing.count += 1;
      existing.resources.add(issue.resourceUrl ?? input.homepageUrl);
      if (severityRank(severity) > severityRank(existing.severity)) {
        existing.severity = severity;
      }
      continue;
    }
    grouped.set(issue.issueCode, {
      count: 1,
      resources: new Set([issue.resourceUrl ?? input.homepageUrl]),
      severity,
    });
  }

  return [...grouped.entries()]
    .map(([issueCode, group]) => {
      const review = getScoreReviewEntry(issueCode);
      const definition = getIssueDefinition(issueCode);
      const rawDeduction = round1(
        Math.min(
          review.scoreWeight.baseDeduction +
            review.scoreWeight.repeatIncrement * Math.max(0, group.count - 1),
          review.scoreWeight.maxDeduction,
        ),
      );
      const confidenceAdjusted =
        input.lowConfidence && definition.scoreScope === 'page' && review.impactTier !== 'BLOCKING'
          ? round1(rawDeduction * input.confidenceMultiplier)
          : rawDeduction;

      return {
        adjustedDeduction: confidenceAdjusted,
        affectedPagesCount:
          definition.scoreScope === 'site'
            ? 0
            : [...group.resources].filter((resource) => resource !== input.homepageUrl).length ||
              group.resources.size,
        cappedDeduction: confidenceAdjusted,
        category: definition.category,
        falsePositiveRisk: review.falsePositiveRisk,
        impactTier: review.impactTier,
        issueCode,
        occurrences: group.count,
        rawDeduction,
        reason: review.reviewNotes,
        scope: definition.scoreScope,
        severity: group.severity,
      } satisfies ScoreDeduction;
    })
    .toSorted((left, right) => right.cappedDeduction - left.cappedDeduction);
}

function buildCategoryDeductions(
  deductions: ScoreDeduction[],
): ScoreBreakdown['categoryDeductions'] {
  return Object.fromEntries(
    Object.values(IssueCategory).map((category) => {
      const categoryDeductions = deductions.filter((deduction) => deduction.category === category);
      const rawDeduction = round1(
        categoryDeductions.reduce((total, deduction) => total + deduction.rawDeduction, 0),
      );
      const cappedDeduction = round1(
        categoryDeductions.reduce((total, deduction) => total + deduction.cappedDeduction, 0),
      );
      return [
        category,
        {
          cappedDeduction,
          rawDeduction,
          score: Math.max(0, Math.round(100 - cappedDeduction)),
        },
      ];
    }),
  ) as ScoreBreakdown['categoryDeductions'];
}

function zeroCategoryDeductions(): ScoreBreakdown['categoryDeductions'] {
  return Object.fromEntries(
    Object.values(IssueCategory).map((category) => [
      category,
      {
        cappedDeduction: category === IssueCategory.TECHNICAL ? 100 : 0,
        rawDeduction: category === IssueCategory.TECHNICAL ? 100 : 0,
        score: 0,
      },
    ]),
  ) as ScoreBreakdown['categoryDeductions'];
}

function buildCriticalRisk(issues: SeoIssue[]): ScoreBreakdown['criticalRisk'] {
  const reasons: string[] = [];
  const issueCodes = new Set<IssueCode>();
  let level: CriticalRiskLevel = 'NONE';

  for (const issue of issues) {
    if (issue.issueCode === IssueCode.DOMAIN_UNREACHABLE) {
      level = 'BLOCKING';
      issueCodes.add(issue.issueCode);
      reasons.push('Domain could not be fetched.');
    }
    if (issue.issueCode === IssueCode.ROBOTS_DISALLOWS_ALL) {
      level = 'BLOCKING';
      issueCodes.add(issue.issueCode);
      reasons.push('robots.txt blocks all crawling.');
    }
    if (issue.issueCode === IssueCode.META_NOINDEX) {
      level =
        issue.severity === Severity.CRITICAL ? 'BLOCKING' : level === 'NONE' ? 'WARNING' : level;
      issueCodes.add(issue.issueCode);
      reasons.push('A noindex directive was found on an indexable candidate.');
    }
    if (issue.issueCode === IssueCode.NO_HTTPS && level === 'NONE') {
      level = 'WARNING';
      issueCodes.add(issue.issueCode);
      reasons.push('The site is not served over HTTPS.');
    }
  }

  return { issueCodes: [...issueCodes], level, reasons: [...new Set(reasons)] };
}

function extractMetricNumber(metrics: SeoMetric[], key: string): number | null {
  const metric = metrics.find((item) => item.key === key);
  return typeof metric?.valueNum === 'number' ? metric.valueNum : null;
}

function confidenceDeductionMultiplier(crawlConfidenceScore: number | null): number {
  if (crawlConfidenceScore === null || crawlConfidenceScore >= 55) {
    return 1;
  }
  if (crawlConfidenceScore < 35) {
    return 0.6;
  }
  return 0.75;
}

function severityRank(severity: Severity): number {
  if (severity === Severity.CRITICAL) return 4;
  if (severity === Severity.HIGH) return 3;
  if (severity === Severity.MEDIUM) return 2;
  return 1;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getIssueCategory(issueCode: IssueCode): IssueCategory {
  return getIssueDefinition(issueCode).category;
}
