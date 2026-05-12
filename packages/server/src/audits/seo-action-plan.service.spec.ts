import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AuditStatus,
  ComparisonChangeType,
  IssueCategory,
  IssueCode,
  IssueState,
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

    expect(prompt).toContain('Actúa como especialista en SEO técnico');
    expect(prompt).toContain('Dominio: example.test');
    expect(prompt).toContain('Auditoría: audit-1');
    expect(prompt).toContain(`Incidencia: Missing Title (${IssueCode.MISSING_TITLE})`);
    expect(prompt).toContain('1. https://example.test/');
    expect(prompt).toContain('2. https://example.test/pricing');
    expect(prompt).toContain('Checklist de validación');
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
  let sites: { getById: jest.Mock };
  let service: SeoActionPlanService;

  beforeEach(() => {
    db = makeDb();
    sites = { getById: jest.fn().mockResolvedValue(site) };
    service = new SeoActionPlanService(db as never, sites as never);
  });

  it('throws when a site has no completed audit yet', async () => {
    db.where.mockReturnValueOnce(thenable([]));

    await expect(service.getForSite('site-1', 'user-1')).rejects.toThrow(
      'No completed audit found',
    );
    expect(sites.getById).toHaveBeenCalledWith('site-1', 'user-1');
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
    expect(plan.executiveSummary.copyText).toContain('Score actual: 72/100 (-8 pts)');
    expect(plan.executiveSummary.nextBestAction).toContain('Añadir títulos únicos');
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

    expect(sites.getById).toHaveBeenCalledWith('site-1', 'user-1');
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
});
