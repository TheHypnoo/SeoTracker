import {
  IssueCategory,
  IssueCode,
  SeoActionEffort,
  SeoActionImpact,
  Severity,
} from '@seotracker/shared-types';

import { buildAuditActionItems } from './action-item-builder';

describe('buildAuditActionItems', () => {
  it('prioritizes by severity, score impact, occurrences and affected pages', () => {
    const actions = buildAuditActionItems({
      issues: [
        {
          category: IssueCategory.ON_PAGE,
          issueCode: IssueCode.MISSING_TITLE,
          message: 'Missing title',
          meta: { expected: '30-60 chars', found: null },
          resourceUrl: 'https://example.test/',
          severity: Severity.HIGH,
        },
        {
          category: IssueCategory.ON_PAGE,
          issueCode: IssueCode.MISSING_TITLE,
          message: 'Missing title',
          meta: { expected: '30-60 chars', found: null },
          resourceUrl: 'https://example.test/pricing',
          severity: Severity.HIGH,
        },
        {
          category: IssueCategory.MEDIA,
          issueCode: IssueCode.IMAGE_WITHOUT_ALT,
          message: 'Missing alt',
          meta: { count: 1 },
          resourceUrl: 'https://example.test/',
          severity: Severity.LOW,
        },
      ],
      run: { id: 'audit-1', score: 72 },
      site: { domain: 'example.test', name: 'Example' },
    });

    expect(actions[0]).toMatchObject({
      affectedPagesCount: 2,
      effort: SeoActionEffort.LOW,
      impact: SeoActionImpact.HIGH,
      issueCode: IssueCode.MISSING_TITLE,
      occurrences: 2,
    });
    expect(actions[0]?.priorityScore).toBeGreaterThan(actions[1]?.priorityScore ?? 0);
    expect(actions[0]?.evidenceSummary).toContain('Valor esperado: 30-60 chars');
    expect(actions[0]?.remediationPrompt).toContain('Auditoría: audit-1');
  });
});
