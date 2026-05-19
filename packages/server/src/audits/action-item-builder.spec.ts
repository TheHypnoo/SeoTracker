import { describe, expect, it } from '@jest/globals';
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

  it('summarizes all supported evidence shapes and fallback copy', () => {
    const actions = buildAuditActionItems({
      issues: [
        issue(IssueCode.TITLE_TOO_SHORT, IssueCategory.ON_PAGE, Severity.MEDIUM, {
          expected: '30-60',
          found: 'Hi',
          length: 2,
        }),
        issue(IssueCode.MISSING_OPEN_GRAPH, IssueCategory.ON_PAGE, Severity.LOW, {
          content: 'og:title missing',
          source: 'head',
        }),
        issue(IssueCode.CANONICAL_MISMATCH, IssueCategory.TECHNICAL, Severity.HIGH, {
          canonical: 'https://example.test/a',
          page: 'https://example.test/b',
        }),
        issue(IssueCode.CANONICAL_NOT_ABSOLUTE, IssueCategory.TECHNICAL, Severity.MEDIUM, {
          canonical: '/relative',
          expected: 'absolute URL',
        }),
        issue(IssueCode.BROKEN_LINK, IssueCategory.CRAWLABILITY, Severity.MEDIUM, {
          statusCode: 404,
        }),
        issue(IssueCode.THIN_CONTENT, IssueCategory.ON_PAGE, Severity.MEDIUM, { wordCount: 42 }),
        issue(IssueCode.NO_LAZY_IMAGES, IssueCategory.MEDIA, Severity.LOW, { lazy: 1, total: 4 }),
        issue(IssueCode.INVALID_HREFLANG, IssueCategory.TECHNICAL, Severity.LOW, {
          samples: ['en-ES', 'xx', 'fr', 'de'],
        }),
        issue(IssueCode.MULTIPLE_H1, IssueCategory.ON_PAGE, Severity.LOW, { bytes: 4096 }),
        issue(IssueCode.DOM_TOO_LARGE, IssueCategory.PERFORMANCE, Severity.LOW, { nodes: 3000 }),
        issue(IssueCode.MISSING_LANG, IssueCategory.ON_PAGE, Severity.LOW, { found: 'none' }),
        issue(IssueCode.MISSING_H1, IssueCategory.ON_PAGE, Severity.LOW, {}),
        issue(IssueCode.TITLE_TOO_LONG, IssueCategory.ON_PAGE, Severity.LOW, {
          found: '',
          length: 80,
        }),
      ],
      run: { id: 'audit-1', score: 72 },
      site: { domain: 'example.test', name: 'Example' },
    });

    const summaries = actions.map((action) => action.evidenceSummary);
    expect(summaries).toStrictEqual(
      expect.arrayContaining([
        expect.stringContaining('Longitud detectada: 2'),
        'head: og:title missing',
        'Canonical detectado: https://example.test/a · página evaluada: https://example.test/b',
        'Canonical detectado: /relative · esperado: absolute URL',
        'HTTP 404',
        'Palabras detectadas: 42',
        'Imágenes lazy: 1/4',
        'Muestras: en-ES, xx, fr',
        'Peso detectado: 4 KB',
        'Nodos DOM detectados: 3000',
        'Valor detectado: none',
        'URL afectada: https://example.test/missing_h1',
        'Longitud detectada: 80',
      ]),
    );
    expect(
      actions.find((action) => action.issueCode === IssueCode.CANONICAL_NOT_ABSOLUTE),
    ).toMatchObject({
      recommendedAction: expect.stringContaining('Resolver'),
    });
  });

  it('upgrades grouped severity and caps affected page details', () => {
    const issues = Array.from({ length: 12 }, (_, index) =>
      issue(IssueCode.MISSING_META_DESCRIPTION, IssueCategory.PERFORMANCE, Severity.LOW, {}, index),
    );
    issues.push(
      issue(
        IssueCode.MISSING_META_DESCRIPTION,
        IssueCategory.PERFORMANCE,
        Severity.CRITICAL,
        {},
        99,
      ),
    );

    const [action] = buildAuditActionItems({
      issues,
      run: { id: 'audit-1', score: 10 },
      site: { domain: 'example.test', name: 'Example' },
    });

    expect(action).toMatchObject({
      affectedPages: expect.arrayContaining(['https://example.test/missing_meta_description-0']),
      affectedPagesCount: 13,
      effort: SeoActionEffort.HIGH,
      impact: SeoActionImpact.HIGH,
      occurrences: 13,
      severity: Severity.CRITICAL,
    });
    expect(action?.affectedPages).toHaveLength(8);
  });

  it('returns medium impact and effort for crawlability issues affecting several pages', () => {
    const actions = buildAuditActionItems({
      issues: Array.from({ length: 4 }, (_, index) =>
        issue(IssueCode.MISSING_SITEMAP, IssueCategory.CRAWLABILITY, Severity.MEDIUM, {}, index),
      ),
      run: { id: 'audit-1', score: 80 },
      site: { domain: 'example.test', name: 'Example' },
    });

    expect(actions[0]).toMatchObject({
      effort: SeoActionEffort.MEDIUM,
      impact: SeoActionImpact.MEDIUM,
      priorityReason: expect.stringContaining('Media'),
    });
  });
});

function issue(
  issueCode: IssueCode,
  category: IssueCategory,
  severity: Severity,
  meta: Record<string, unknown>,
  suffix?: number,
) {
  const slug = issueCode.toLowerCase();
  return {
    category,
    issueCode,
    message: `${issueCode} message`,
    meta,
    resourceUrl: `https://example.test/${slug}${suffix === undefined ? '' : `-${suffix}`}`,
    severity,
  };
}
