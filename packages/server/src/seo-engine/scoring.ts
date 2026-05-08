import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import { getIssueDefinition, ISSUE_DEFINITIONS } from './issue-definitions';
import type { ScoreBreakdown, SeoIssue, SeoPageResult } from './seo-engine.types';

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
  if (issues.some((issue) => ZERO_SCORE_CODES.has(issue.issueCode))) {
    return zeroScore();
  }

  const codeCounts = new Map<IssueCode, { severity: Severity; count: number }>();
  for (const issue of issues) {
    const entry = codeCounts.get(issue.issueCode);
    if (entry) {
      entry.count += 1;
    } else {
      codeCounts.set(issue.issueCode, {
        count: 1,
        severity: issue.severity ?? getIssueDefinition(issue.issueCode).defaultSeverity,
      });
    }
  }

  const perSeverityRaw: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
  };
  for (const [issueCode, { severity, count }] of codeCounts.entries()) {
    const definition = getIssueDefinition(issueCode);
    const deduction = Math.min(
      definition.baseDeduction + definition.repeatIncrement * Math.max(0, count - 1),
      definition.maxDeduction,
    );
    perSeverityRaw[severity] += deduction;
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
  const hasZeroScoreIssue = issues.some((issue) => ZERO_SCORE_CODES.has(issue.issueCode));
  if (hasZeroScoreIssue) {
    return {
      breakdown: zeroScore().breakdown,
      categoryScores: Object.fromEntries(
        Object.values(IssueCategory).map((cat) => [cat, 0]),
      ) as Record<IssueCategory, number>,
      pageScores: new Map(pages.map((page) => [page.url, 0])),
      score: 0,
    };
  }

  const overall = scoreForIssues(issues);

  const categoryScores = Object.fromEntries(
    Object.values(IssueCategory).map((cat) => [
      cat,
      scoreForIssues(issues.filter((i) => getIssueDefinition(i.issueCode).category === cat)).score,
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

function zeroScore(): { score: number; breakdown: ScoreBreakdown } {
  return {
    breakdown: {
      perSeverity: {
        [Severity.CRITICAL]: { cappedDeduction: 100, rawDeduction: 100 },
        [Severity.HIGH]: { cappedDeduction: 0, rawDeduction: 0 },
        [Severity.MEDIUM]: { cappedDeduction: 0, rawDeduction: 0 },
        [Severity.LOW]: { cappedDeduction: 0, rawDeduction: 0 },
      },
      totalDeduction: 100,
    },
    score: 0,
  };
}

export function getIssueCategory(issueCode: IssueCode): IssueCategory {
  return getIssueDefinition(issueCode).category;
}
