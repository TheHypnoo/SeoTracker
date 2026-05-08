import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditKeyFindingsPanel, type SeoActionPlanPayload } from './seo-action-plan-panel';

describe('AuditKeyFindingsPanel', () => {
  it('shows structured evidence and regression counts for prioritized actions', () => {
    render(<AuditKeyFindingsPanel plan={makePlan()} />);

    expect(screen.getByText('2 regresiones')).toBeTruthy();
    expect(screen.getByText(/Longitud detectada: 12/)).toBeTruthy();
    expect(screen.getByText('Plan de solución')).toBeTruthy();
  });
});

function makePlan(): SeoActionPlanPayload {
  return {
    actions: [
      {
        affectedPages: ['https://example.test/very/long/path'],
        affectedPagesCount: 1,
        category: 'META',
        categoryLabel: 'Metadatos',
        effort: 'LOW',
        estimatedImpactPoints: 8,
        evidenceSummary: 'Longitud detectada: 12',
        id: 'TITLE_TOO_SHORT',
        impact: 'HIGH',
        issueCode: 'TITLE_TOO_SHORT',
        occurrences: 1,
        priority: 120,
        priorityReason: 'Alta',
        recommendedAction: 'Amplia el title principal.',
        regressionCount: 2,
        remediationPrompt: 'Arregla el title.',
        scoreImpactPoints: 8,
        severity: 'HIGH',
        status: 'OPEN',
        title: 'Title Too Short',
      },
    ],
    audit: {
      createdAt: '2026-05-08T10:00:00Z',
      finishedAt: '2026-05-08T10:01:00Z',
      id: 'audit-1',
      previousScore: 80,
      score: 72,
      scoreDelta: -8,
      status: 'COMPLETED',
    },
    executiveSummary: {
      copyText: 'Resumen',
      criticalOpenActions: 0,
      improvementsDetected: 0,
      nextBestAction: 'Amplia el title principal.',
      score: 72,
      scoreDelta: -8,
      topRisk: 'Title Too Short',
    },
    site: {
      domain: 'example.test',
      id: 'site-1',
      name: 'Example',
    },
    totals: {
      actions: 1,
      affectedPages: 1,
      fixed: 0,
      ignored: 0,
      open: 1,
      regressions: 2,
    },
  };
}
