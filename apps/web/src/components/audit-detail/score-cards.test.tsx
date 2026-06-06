import { IssueCategory, IssueCode, type ScoreBreakdown, Severity } from '@seotracker/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AuditRun } from './audit-detail-types';
import { ScoreContextPanel } from './score-cards';

type PanelRun = Pick<
  AuditRun,
  'seoScore' | 'crawlConfidenceScore' | 'criticalRisk' | 'scoreBreakdown' | 'scoringModelVersion'
>;

function makeRun(overrides: Partial<PanelRun> = {}): PanelRun {
  return {
    crawlConfidenceScore: null,
    criticalRisk: null,
    scoreBreakdown: null,
    scoringModelVersion: null,
    seoScore: null,
    ...overrides,
  };
}

const VALID_BREAKDOWN: ScoreBreakdown = {
  categoryDeductions: {
    CRAWLABILITY: { cappedDeduction: 0, rawDeduction: 0, score: 100 },
    MEDIA: { cappedDeduction: 0, rawDeduction: 0, score: 100 },
    ON_PAGE: { cappedDeduction: 11, rawDeduction: 11, score: 89 },
    PERFORMANCE: { cappedDeduction: 0, rawDeduction: 0, score: 100 },
    TECHNICAL: { cappedDeduction: 0, rawDeduction: 0, score: 100 },
  },
  confidenceAdjustment: { applied: false, multiplier: 1, reason: null },
  crawlConfidenceScore: 82,
  criticalRisk: { issueCodes: [], level: 'NONE', reasons: [] },
  deductions: [],
  modelVersion: 'v2.0',
  rawSeoScore: 89,
  rawTotalDeduction: 11,
  scopeDeductions: { page: 11, site: 0 },
  seoScore: 89,
  topDeductions: [
    {
      adjustedDeduction: 11,
      affectedPagesCount: 1,
      cappedDeduction: 11,
      category: IssueCategory.ON_PAGE,
      falsePositiveRisk: 'LOW',
      impactTier: 'HIGH',
      issueCode: IssueCode.MISSING_TITLE,
      occurrences: 1,
      rawDeduction: 11,
      reason: 'El title es una señal on-page primaria.',
      scope: 'page',
      severity: Severity.HIGH,
    },
  ],
  totalDeduction: 11,
};

describe(ScoreContextPanel, () => {
  afterEach(cleanup);

  it('renders the active-model breakdown with its top deductions', () => {
    render(<ScoreContextPanel run={makeRun({ scoreBreakdown: VALID_BREAKDOWN, seoScore: 89 })} />);

    expect(screen.getByText('89/100')).toBeTruthy();
    expect(screen.getByText('MISSING_TITLE')).toBeTruthy();
  });

  it('does not crash on a legacy breakdown shape and falls back to scalar columns', () => {
    const legacy = {
      perSeverity: { HIGH: { cappedDeduction: 12, rawDeduction: 12 } },
      totalDeduction: 12,
    } as unknown as ScoreBreakdown;

    render(
      <ScoreContextPanel
        run={makeRun({ crawlConfidenceScore: 70, scoreBreakdown: legacy, seoScore: 88 })}
      />,
    );

    // Falls back to the scalar columns; no top-deduction list from legacy data.
    expect(screen.getByText('88/100')).toBeTruthy();
    expect(screen.queryByText('Principales penalizaciones')).toBeNull();
  });

  it('renders nothing for an empty breakdown with no scalar scores', () => {
    const { container } = render(
      <ScoreContextPanel run={makeRun({ scoreBreakdown: {} as unknown as ScoreBreakdown })} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
