import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AuditStatus,
  ComparisonChangeType,
  IssueCategory,
  IssueCode,
  IssueState,
  Permission,
  SeoActionEffort,
  Severity,
} from '@seotracker/shared-types';

import { SeoActionPlanService, buildRemediationPrompt } from './seo-action-plan.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
  };
}

function expectPromptToContainAll(prompt: string, fragments: string[]) {
  for (const fragment of fragments) {
    expect(prompt).toContain(fragment);
  }
}

describe('buildRemediationPrompt', () => {
  it('creates a concrete prompt with audit context and affected URLs', () => {
    const prompt = buildRemediationPrompt({
      affectedPages: ['https://example.test/', 'https://example.test/pricing'],
      categoryLabel: 'Contenido on-page',
      issueCode: IssueCode.MISSING_TITLE,
      message: 'Missing title',
      occurrences: 2,
      recommendedAction: 'Añadir títulos únicos y descriptivos en las páginas afectadas.',
      run: { id: 'audit-1', score: 72 },
      severity: Severity.HIGH,
      site: { domain: 'example.test', name: 'Example' },
      title: 'Missing Title',
    });

    expectPromptToContainAll(prompt, [
      'Actúa como especialista en SEO técnico',
      'Dominio: example.test',
      'Auditoría: audit-1',
      `Incidencia: Missing Title (${IssueCode.MISSING_TITLE})`,
      '1. https://example.test/',
      '2. https://example.test/pricing',
      'Checklist de validación',
    ]);
  });

  it('handles domain-level issues without a concrete URL', () => {
    const prompt = buildRemediationPrompt({
      affectedPages: [],
      categoryLabel: 'Rastreo e indexación',
      issueCode: IssueCode.DOMAIN_UNREACHABLE,
      message: 'Domain unreachable',
      occurrences: 1,
      recommendedAction: 'Restaurar disponibilidad del dominio.',
      run: { id: 'audit-2', score: 0 },
      severity: Severity.CRITICAL,
      site: { domain: 'down.test', name: 'Down' },
      title: 'Domain Unreachable',
    });

    expect(prompt).toContain('Sin URL concreta');
    expect(prompt).toContain('Score actual: 0/100');
  });
});

describe('seoActionPlanService', () => {
  const site = {
    id: 'site-1',
    name: 'Example',
    domain: 'example.test',
  };
  const latestRun = {
    id: 'audit-2',
    siteId: 'site-1',
    status: AuditStatus.COMPLETED,
    score: 72,
    createdAt: new Date('2026-05-08T10:00:00.000Z'),
    finishedAt: new Date('2026-05-08T10:05:00.000Z'),
  };
  let db: DbMock;
  let sites: { getByIdWithPermission: jest.Mock };
  let service: SeoActionPlanService;

  beforeEach(() => {
    db = makeDb();
    sites = { getByIdWithPermission: jest.fn().mockResolvedValue(site) };
    service = new SeoActionPlanService(db as never, sites as never);
  });

  it('throws when a site has no completed audit yet', async () => {
    db.where.mockReturnValueOnce(thenable([]));

    await expect(service.getForSite('site-1', 'user-1')).rejects.toThrow(
      'No completed audit found',
    );
    expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.AUDIT_READ,
    );
  });

  it('builds an action plan from the latest completed audit for a site', async () => {
    db.where
      .mockReturnValueOnce(thenable([latestRun]))
      .mockReturnValueOnce(
        thenable([
          {
            auditRunId: 'audit-2',
            category: IssueCategory.ON_PAGE,
            issueCode: IssueCode.MISSING_TITLE,
            message: 'Missing title',
            resourceUrl: 'https://example.test/',
            severity: Severity.HIGH,
          },
          {
            auditRunId: 'audit-2',
            category: IssueCategory.ON_PAGE,
            issueCode: IssueCode.MISSING_TITLE,
            message: 'Missing title',
            resourceUrl: 'https://example.test/pricing',
            severity: Severity.CRITICAL,
          },
          {
            auditRunId: 'audit-2',
            category: IssueCategory.PERFORMANCE,
            issueCode: IssueCode.PAGE_TOO_HEAVY,
            message: 'Page too heavy',
            resourceUrl: 'https://example.test/',
            severity: Severity.MEDIUM,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(
        thenable([
          {
            issueCode: IssueCode.MISSING_TITLE,
            resourceKey: 'https://example.test/',
            state: IssueState.OPEN,
          },
          {
            issueCode: IssueCode.MISSING_TITLE,
            resourceKey: 'https://example.test/pricing',
            state: IssueState.IGNORED,
          },
          {
            issueCode: IssueCode.PAGE_TOO_HEAVY,
            resourceKey: 'https://example.test/',
            state: IssueState.FIXED,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([{ score: 80 }]))
      .mockReturnValueOnce(
        thenable([
          {
            id: 'comparison-1',
            improvementsCount: 1,
            regressionsCount: 2,
          },
        ]),
      )
      .mockReturnValueOnce(
        thenable([
          {
            changeType: ComparisonChangeType.NEW_ISSUE,
            issueCode: IssueCode.MISSING_TITLE,
          },
          {
            changeType: ComparisonChangeType.SEVERITY_REGRESSION,
            issueCode: IssueCode.MISSING_TITLE,
          },
        ]),
      );

    const plan = await service.getForSite('site-1', 'user-1');

    expect(plan.audit).toMatchObject({
      id: 'audit-2',
      previousScore: 80,
      score: 72,
      scoreDelta: -8,
      status: AuditStatus.COMPLETED,
    });
    expect(plan.totals).toMatchObject({
      actions: 2,
      affectedPages: 2,
      fixed: 1,
      ignored: 0,
      open: 1,
      regressions: 2,
    });
    expect(plan.actions[0]).toMatchObject({
      affectedPages: ['https://example.test/', 'https://example.test/pricing'],
      affectedPagesCount: 2,
      categoryLabel: 'Contenido on-page',
      issueCode: IssueCode.MISSING_TITLE,
      occurrences: 2,
      regressionCount: 2,
      severity: Severity.CRITICAL,
      status: IssueState.OPEN,
    });
    expect(plan.actions[1]).toMatchObject({
      effort: SeoActionEffort.HIGH,
      issueCode: IssueCode.PAGE_TOO_HEAVY,
      status: IssueState.FIXED,
    });
    expect(plan.executiveSummary).toMatchObject({
      copyText: expect.stringContaining('Score actual: 72/100 (-8 pts)'),
      nextBestAction: expect.stringContaining('Añadir títulos únicos'),
    });
  });

  it('loads a plan for a specific audit id and reports a clean executive summary', async () => {
    db.where
      .mockReturnValueOnce(thenable([latestRun]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([]));

    const plan = await service.getForAudit('audit-2', 'user-1');

    expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.AUDIT_READ,
    );
    expect(plan.actions).toStrictEqual([]);
    expect(plan.executiveSummary).toMatchObject({
      criticalOpenActions: 0,
      nextBestAction: null,
      score: 72,
      scoreDelta: null,
      topRisk: null,
    });
    expect(plan.executiveSummary.copyText).toContain(
      'Sin incidencias abiertas en la auditoría seleccionada.',
    );
  });

  it('throws when the requested audit id does not exist', async () => {
    db.where.mockReturnValueOnce(thenable([]));

    await expect(service.getForAudit('missing-audit', 'user-1')).rejects.toThrow('Audit not found');
    expect(sites.getByIdWithPermission).not.toHaveBeenCalled();
  });

  it('prefers persisted action items when available', async () => {
    db.where
      .mockReturnValueOnce(thenable([latestRun]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(
        thenable([
          {
            affectedPages: ['https://example.test/'],
            affectedPagesCount: 1,
            category: IssueCategory.ON_PAGE,
            effort: SeoActionEffort.LOW,
            evidenceSummary: 'Longitud detectada: 12',
            impact: 'HIGH',
            issueCode: IssueCode.MISSING_TITLE,
            occurrences: 1,
            priorityReason: 'Alta · impacto estimado 14 pts · 1 ocurrencias',
            priorityScore: 114,
            recommendedAction: 'Añadir títulos únicos',
            remediationPrompt: 'Prompt persisted',
            scoreImpactPoints: 14,
            severity: Severity.HIGH,
          },
        ]),
      )
      .mockReturnValueOnce(
        thenable([
          {
            issueCode: IssueCode.MISSING_TITLE,
            resourceKey: 'https://example.test/',
            state: IssueState.OPEN,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([{ score: 70 }]))
      .mockReturnValueOnce(thenable([]));

    const plan = await service.getForAudit('audit-2', 'user-1');

    expect(plan.actions[0]).toMatchObject({
      evidenceSummary: 'Longitud detectada: 12',
      priority: 114,
      priorityReason: 'Alta · impacto estimado 14 pts · 1 ocurrencias',
      remediationPrompt: 'Prompt persisted',
      scoreImpactPoints: 14,
      status: IssueState.OPEN,
    });
  });

  it('applies ignored and fixed persisted-state priority penalties', async () => {
    db.where
      .mockReturnValueOnce(thenable([latestRun]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(
        thenable([
          {
            affectedPages: [],
            affectedPagesCount: 0,
            category: IssueCategory.TECHNICAL,
            effort: SeoActionEffort.LOW,
            evidenceSummary: 'No canonical',
            impact: 'MEDIUM',
            issueCode: IssueCode.MISSING_CANONICAL,
            occurrences: 1,
            priorityReason: 'Persisted canonical',
            priorityScore: 70,
            recommendedAction: 'Definir canonical absoluto',
            remediationPrompt: 'Prompt canonical',
            scoreImpactPoints: 4,
            severity: Severity.MEDIUM,
          },
          {
            affectedPages: ['https://example.test/fixed'],
            affectedPagesCount: 1,
            category: IssueCategory.MEDIA,
            effort: SeoActionEffort.LOW,
            evidenceSummary: 'Image alt',
            impact: 'LOW',
            issueCode: IssueCode.IMAGE_WITHOUT_ALT,
            occurrences: 1,
            priorityReason: 'Persisted media',
            priorityScore: 60,
            recommendedAction: 'Añadir alt',
            remediationPrompt: 'Prompt media',
            scoreImpactPoints: 2,
            severity: Severity.LOW,
          },
        ]),
      )
      .mockReturnValueOnce(
        thenable([
          {
            issueCode: IssueCode.MISSING_CANONICAL,
            resourceKey: '',
            state: IssueState.IGNORED,
          },
          {
            issueCode: IssueCode.IMAGE_WITHOUT_ALT,
            resourceKey: 'https://example.test/fixed',
            state: IssueState.FIXED,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([{ score: 70 }]))
      .mockReturnValueOnce(thenable([]));

    const plan = await service.getForAudit('audit-2', 'user-1');

    expect(
      plan.actions.find((action) => action.issueCode === IssueCode.MISSING_CANONICAL),
    ).toMatchObject({
      priority: 35,
      status: IssueState.IGNORED,
    });
    expect(
      plan.actions.find((action) => action.issueCode === IssueCode.IMAGE_WITHOUT_ALT),
    ).toMatchObject({
      priority: 0,
      status: IssueState.FIXED,
    });
    expect(plan.totals).toMatchObject({ fixed: 1, ignored: 1, open: 0 });
  });

  it('estimates crawlability actions as medium effort', async () => {
    db.where
      .mockReturnValueOnce(thenable([latestRun]))
      .mockReturnValueOnce(
        thenable([
          {
            auditRunId: 'audit-2',
            category: IssueCategory.CRAWLABILITY,
            issueCode: IssueCode.MISSING_SITEMAP,
            message: 'Missing sitemap',
            resourceUrl: 'https://example.test/sitemap.xml',
            severity: Severity.MEDIUM,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(thenable([{ score: 70 }]))
      .mockReturnValueOnce(thenable([]));

    const plan = await service.getForSite('site-1', 'user-1');

    expect(plan.actions[0]).toMatchObject({
      effort: SeoActionEffort.MEDIUM,
      issueCode: IssueCode.MISSING_SITEMAP,
    });
  });

  it('builds fallback actions with default copy, low effort, and capped page previews', async () => {
    const unknownIssueCode = 'CUSTOM_UNKNOWN' as IssueCode;
    const pages = Array.from({ length: 14 }, (_, index) => `https://example.test/page-${index}`);
    db.where
      .mockReturnValueOnce(thenable([{ ...latestRun, score: null }]))
      .mockReturnValueOnce(
        thenable(
          pages.map((resourceUrl) => ({
            auditRunId: 'audit-2',
            category: IssueCategory.ON_PAGE,
            issueCode: unknownIssueCode,
            message: 'Unexpected canonical',
            resourceUrl,
            severity: Severity.LOW,
          })),
        ),
      )
      .mockReturnValueOnce(thenable([]))
      .mockReturnValueOnce(
        thenable([
          {
            issueCode: unknownIssueCode,
            resourceKey: pages[0],
            state: IssueState.IGNORED,
          },
        ]),
      )
      .mockReturnValueOnce(thenable([{ score: null }]))
      .mockReturnValueOnce(thenable([]));

    const plan = await service.getForSite('site-1', 'user-1');

    expect(plan.actions[0]).toMatchObject({
      affectedPages: pages.slice(0, 6),
      affectedPagesCount: 14,
      effort: SeoActionEffort.HIGH,
      impact: 'LOW',
      issueCode: unknownIssueCode,
      priority: 63,
      recommendedAction:
        'Resolver "Unexpected canonical" en las URLs afectadas y validar de nuevo.',
      scoreImpactPoints: 6,
    });
  });
});
