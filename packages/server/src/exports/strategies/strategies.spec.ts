import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditStatus, AuditTrigger, ExportKind } from '@seotracker/shared-types';

import { DRIZZLE } from '../../database/database.constants';
import { ActionPlanCsvStrategy } from './action-plan.strategy';
import { AuditResultCsvStrategy } from './audit-result.strategy';
import { ComparisonCsvStrategy } from './comparison.strategy';
import { HistoryCsvStrategy } from './history.strategy';
import { IndexabilityCsvStrategy } from './indexability.strategy';
import { IssuesCsvStrategy } from './issues.strategy';
import { MetricsCsvStrategy } from './metrics.strategy';

// drizzle thenable: lets a single mock return value satisfy both `await chain`
// and `chain.limit()/.orderBy()/.then(rows => rows[0])`.
function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockResolvedValue(rows),
    then: (resolve: (value: T) => unknown, reject?: (reason?: unknown) => unknown): unknown =>
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

const ISO_DATE = new Date('2026-01-01T00:00:00Z');

describe('historyCsvStrategy', () => {
  let strategy: HistoryCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [HistoryCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(HistoryCsvStrategy);
  });

  it('declares ExportKind.HISTORY', () => {
    expect(strategy.kind).toBe(ExportKind.HISTORY);
  });

  it('returns headers + rows from auditRuns ordered by createdAt desc', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'r1',
          trigger: AuditTrigger.MANUAL,
          status: AuditStatus.COMPLETED,
          score: 90,
          httpStatus: 200,
          responseMs: 120,
          createdAt: ISO_DATE,
          finishedAt: ISO_DATE,
        },
      ]),
    );

    const out = await strategy.build({
      siteId: 's1',
      filters: {},
    } as never);

    expect(out.headers[0]).toBe('auditId');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.[0]).toBe('r1');
  });

  it('filters by status when filters.status is set', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'r1',
          trigger: 'MANUAL',
          status: 'COMPLETED',
          score: 1,
          httpStatus: 200,
          responseMs: 1,
          createdAt: ISO_DATE,
          finishedAt: ISO_DATE,
        },
        {
          id: 'r2',
          trigger: 'MANUAL',
          status: 'FAILED',
          score: 0,
          httpStatus: 500,
          responseMs: 1,
          createdAt: ISO_DATE,
          finishedAt: null,
        },
      ]),
    );

    const out = await strategy.build({
      siteId: 's1',
      filters: { status: 'COMPLETED' },
    } as never);

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.[0]).toBe('r1');
  });

  it('filters by trigger when filters.trigger is set', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'r1',
          trigger: 'MANUAL',
          status: 'COMPLETED',
          score: 1,
          httpStatus: 200,
          responseMs: 1,
          createdAt: ISO_DATE,
          finishedAt: ISO_DATE,
        },
        {
          id: 'r2',
          trigger: 'SCHEDULED',
          status: 'COMPLETED',
          score: 1,
          httpStatus: 200,
          responseMs: 1,
          createdAt: ISO_DATE,
          finishedAt: ISO_DATE,
        },
      ]),
    );

    const out = await strategy.build({
      siteId: 's1',
      filters: { trigger: 'SCHEDULED' },
    } as never);

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.[0]).toBe('r2');
  });

  it('emits empty strings for null score / httpStatus / responseMs', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'r1',
          trigger: 'MANUAL',
          status: 'QUEUED',
          score: null,
          httpStatus: null,
          responseMs: null,
          createdAt: ISO_DATE,
          finishedAt: null,
        },
      ]),
    );

    const out = await strategy.build({ siteId: 's1', filters: {} } as never);

    const row = out.rows[0];
    expect(row?.[3]).toBe('');
    expect(row?.[4]).toBe('');
    expect(row?.[5]).toBe('');
    expect(row?.[7]).toBe('');
  });
});

describe('issuesCsvStrategy', () => {
  let strategy: IssuesCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [IssuesCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(IssuesCsvStrategy);
  });

  it('throws BadRequestException when auditRunId is missing', async () => {
    await expect(strategy.build({ auditRunId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns issues rows with the expected columns', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'i1',
          issueCode: 'TITLE_MISSING',
          category: 'META',
          severity: 'CRITICAL',
          message: 'no title',
          resourceUrl: null,
          createdAt: ISO_DATE,
        },
      ]),
    );

    const out = await strategy.build({ auditRunId: 'run-1' } as never);

    expect(out.headers).toStrictEqual([
      'issueId',
      'issueCode',
      'category',
      'severity',
      'message',
      'resourceUrl',
      'createdAt',
    ]);
    expect(out.rows[0]?.[5]).toBe(''); // null resourceUrl → ''
  });
});

describe('metricsCsvStrategy', () => {
  let strategy: MetricsCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [MetricsCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(MetricsCsvStrategy);
  });

  it('throws BadRequestException when auditRunId is missing', async () => {
    await expect(strategy.build({ auditRunId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns metrics rows', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        { id: 'm1', key: 'lcp', valueNum: 1.2, valueText: null, createdAt: ISO_DATE },
        { id: 'm2', key: 'note', valueNum: null, valueText: 'ok', createdAt: ISO_DATE },
      ]),
    );

    const out = await strategy.build({ auditRunId: 'run-1' } as never);

    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.[2]).toBe(1.2);
    expect(out.rows[1]?.[3]).toBe('ok');
  });
});

describe('comparisonCsvStrategy', () => {
  let strategy: ComparisonCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [ComparisonCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(ComparisonCsvStrategy);
  });

  it('throws BadRequestException when comparisonId is missing', async () => {
    await expect(strategy.build({ comparisonId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the comparison row does not exist', async () => {
    // First query (comparison .limit().then(rows => rows[0])) → []
    // Second query (changes .where(...)) → []
    db.where.mockReturnValueOnce(thenable([])).mockReturnValueOnce(thenable([]));

    await expect(strategy.build({ comparisonId: 'c1' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns rows shaped for changes table', async () => {
    db.where
      .mockReturnValueOnce(thenable([{ id: 'c1' }])) // comparison
      .mockReturnValueOnce(
        thenable([
          {
            changeType: 'NEW_ISSUE',
            issueCode: 'X',
            issueCategory: 'META',
            severity: 'WARNING',
            title: 'something',
            delta: 1,
            createdAt: ISO_DATE,
          },
        ]),
      );

    const out = await strategy.build({ comparisonId: 'c1' } as never);

    expect(out.headers[0]).toBe('comparisonId');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.[0]).toBe('c1');
    expect(out.rows[0]?.[1]).toBe('NEW_ISSUE');
  });
});

describe('auditResultCsvStrategy', () => {
  let strategy: AuditResultCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditResultCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(AuditResultCsvStrategy);
  });

  it('throws BadRequestException when auditRunId is missing', async () => {
    await expect(strategy.build({ auditRunId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the audit run is missing', async () => {
    db.where
      .mockReturnValueOnce(thenable([])) // run
      .mockReturnValueOnce(thenable([])) // metrics
      .mockReturnValueOnce(thenable([])) // pages
      .mockReturnValueOnce(thenable([])) // issues
      .mockReturnValueOnce(thenable([])) // action items
      .mockReturnValueOnce(thenable([])); // indexability

    await expect(strategy.build({ auditRunId: 'r1' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('emits a flat report: summary + metric + page + issue rows', async () => {
    db.where
      .mockReturnValueOnce(
        thenable([{ id: 'r1', status: 'COMPLETED', score: 90, httpStatus: 200, responseMs: 100 }]),
      )
      .mockReturnValueOnce(thenable([{ key: 'lcp', valueNum: 1.2, valueText: null }]))
      .mockReturnValueOnce(thenable([{ url: 'https://x.test/', statusCode: 200, responseMs: 50 }]))
      .mockReturnValueOnce(thenable([{ issueCode: 'TITLE_MISSING', message: 'no title' }]))
      .mockReturnValueOnce(
        thenable([{ issueCode: 'TITLE_MISSING', recommendedAction: 'Add a title' }]),
      )
      .mockReturnValueOnce(thenable([{ url: 'https://x.test/', indexabilityStatus: 'INDEXABLE' }]));

    const out = await strategy.build({ auditRunId: 'r1' } as never);

    expect(out.headers).toStrictEqual(['section', 'key', 'value']);
    // 5 summary + 1 metric + 1 page + 1 issue + 1 action + 1 indexability = 10
    expect(out.rows).toHaveLength(10);
    expect(out.rows[0]).toStrictEqual(['summary', 'auditId', 'r1']);
    expect(out.rows[5]).toStrictEqual(['metric', 'lcp', '1.2']);
    expect(out.rows.slice(6).map((row) => row[0])).toStrictEqual([
      'page',
      'issue',
      'action',
      'indexability',
    ]);
  });
});

describe('actionPlanCsvStrategy', () => {
  let strategy: ActionPlanCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [ActionPlanCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(ActionPlanCsvStrategy);
  });

  it('throws BadRequestException when auditRunId is missing', async () => {
    await expect(strategy.build({ auditRunId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exports persisted action plan rows', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          affectedPages: ['https://x.test/', 'https://x.test/pricing'],
          affectedPagesCount: 2,
          category: 'META',
          createdAt: ISO_DATE,
          effort: 'LOW',
          evidenceSummary: 'Longitud detectada: 12',
          id: 'a1',
          impact: 'HIGH',
          issueCode: 'TITLE_TOO_SHORT',
          occurrences: 2,
          priorityReason: 'Alta',
          priorityScore: 110,
          recommendedAction: 'Amplia el title',
          remediationPrompt: 'Prompt',
          scoreImpactPoints: 8,
          severity: 'HIGH',
        },
      ]),
    );

    const out = await strategy.build({ auditRunId: 'run-1' } as never);

    expect(strategy.kind).toBe(ExportKind.ACTION_PLAN);
    expect(out.headers).toContain('priorityScore');
    expect(out.rows[0]?.[0]).toBe('a1');
    expect(out.rows[0]?.[10]).toContain('https://x.test/pricing');
  });
});

describe('indexabilityCsvStrategy', () => {
  let strategy: IndexabilityCsvStrategy;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [IndexabilityCsvStrategy, { provide: DRIZZLE, useValue: db }],
    }).compile();
    strategy = moduleRef.get(IndexabilityCsvStrategy);
  });

  it('throws BadRequestException when auditRunId is missing', async () => {
    await expect(strategy.build({ auditRunId: null } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exports indexability matrix rows with evidence', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          canonicalUrl: 'https://x.test/canonical',
          createdAt: ISO_DATE,
          evidence: { reason: 'canonical mismatch' },
          id: 'u1',
          indexabilityStatus: 'CANONICALIZED',
          robotsDirective: null,
          sitemapIncluded: true,
          source: 'crawl',
          statusCode: 200,
          url: 'https://x.test/page',
          xRobotsTag: null,
        },
      ]),
    );

    const out = await strategy.build({ auditRunId: 'run-1' } as never);

    expect(strategy.kind).toBe(ExportKind.INDEXABILITY);
    expect(out.headers).toContain('indexabilityStatus');
    expect(out.rows[0]?.[4]).toBe('CANONICALIZED');
    expect(out.rows[0]?.[9]).toContain('canonical mismatch');
  });
});
