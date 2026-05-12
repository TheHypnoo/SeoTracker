import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditStatus, ComparisonChangeType, Severity } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { SitesService } from '../sites/sites.service';
import { AuditComparisonService } from './audit-comparison.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(rows),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  };
}

const RUN_A = {
  id: 'r-old',
  siteId: 's1',
  status: 'COMPLETED',
  score: 90,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const RUN_B = {
  id: 'r-new',
  siteId: 's1',
  status: 'COMPLETED',
  score: 80,
  createdAt: new Date('2026-01-02T00:00:00Z'),
};

describe('AuditComparisonService', () => {
  let service: AuditComparisonService;
  let db: DbMock;
  let sites: { getById: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    sites = { getById: jest.fn().mockResolvedValue({ id: 's1' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditComparisonService,
        { provide: DRIZZLE, useValue: db },
        { provide: SitesService, useValue: sites },
      ],
    }).compile();
    service = moduleRef.get(AuditComparisonService);
  });

  describe('buildComparisonSnapshot', () => {
    it('detects SCORE_DROP when target score is lower than baseline', async () => {
      // Two issue queries (from, to) — both empty.
      db.where.mockReturnValueOnce(thenable([])).mockReturnValueOnce(thenable([]));

      const snap = await service.buildComparisonSnapshot('s1', RUN_A, RUN_B);

      const types = snap.changes.map((c) => c.changeType);
      expect(types).toContain(ComparisonChangeType.SCORE_DROP);
      expect(snap.delta.score).toBe(-10);
      expect(snap.summary.regressionsCount).toBe(1);
    });

    it('detects SCORE_IMPROVEMENT when target score is higher', async () => {
      db.where.mockReturnValueOnce(thenable([])).mockReturnValueOnce(thenable([]));

      const snap = await service.buildComparisonSnapshot(
        's1',
        { ...RUN_A, score: 70 },
        { ...RUN_B, score: 95 },
      );

      const types = snap.changes.map((c) => c.changeType);
      expect(types).toContain(ComparisonChangeType.SCORE_IMPROVEMENT);
      expect(snap.summary.improvementsCount).toBe(1);
    });

    it('detects NEW_ISSUE when an issue exists only in target', async () => {
      db.where
        .mockReturnValueOnce(thenable([])) // from: no issues
        .mockReturnValueOnce(
          thenable([
            {
              id: 'i1',
              issueCode: 'TITLE_MISSING',
              category: 'META',
              severity: Severity.CRITICAL,
              message: 'no title',
              resourceUrl: '/page-1',
            },
          ]),
        );

      const snap = await service.buildComparisonSnapshot('s1', RUN_A, RUN_B);

      const newIssues = snap.changes.filter((c) => c.changeType === ComparisonChangeType.NEW_ISSUE);
      expect(newIssues.length).toBe(1);
      expect(newIssues[0]?.severity).toBe(Severity.CRITICAL);
    });

    it('detects RESOLVED_ISSUE when an issue disappears', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              id: 'i1',
              issueCode: 'TITLE_MISSING',
              category: 'META',
              severity: Severity.CRITICAL,
              message: 'no title',
              resourceUrl: '/page-1',
            },
          ]),
        )
        .mockReturnValueOnce(thenable([])); // to: clean

      const snap = await service.buildComparisonSnapshot('s1', RUN_A, RUN_B);

      const resolved = snap.changes.filter(
        (c) => c.changeType === ComparisonChangeType.RESOLVED_ISSUE,
      );
      expect(resolved.length).toBe(1);
    });

    it('aggregates duplicates by signature (issueCode + resourceUrl + message)', async () => {
      db.where
        .mockReturnValueOnce(thenable([])) // from
        .mockReturnValueOnce(
          thenable([
            // Same code + url + message → counts as one signature with delta=2
            {
              id: 'i1',
              issueCode: 'IMG_NO_ALT',
              category: 'CONTENT',
              severity: Severity.LOW,
              message: 'missing alt',
              resourceUrl: '/img.png',
            },
            {
              id: 'i2',
              issueCode: 'IMG_NO_ALT',
              category: 'CONTENT',
              severity: Severity.LOW,
              message: 'missing alt',
              resourceUrl: '/img.png',
            },
          ]),
        );

      const snap = await service.buildComparisonSnapshot('s1', RUN_A, RUN_B);

      const newIssues = snap.changes.filter((c) => c.changeType === ComparisonChangeType.NEW_ISSUE);
      expect(newIssues.length).toBe(1);
      expect(newIssues[0]?.delta).toBe(2);
    });
  });

  describe('compareProjectRuns', () => {
    it('throws NotFoundException when fewer than 2 runs are available', async () => {
      // resolveRuns: no fromId/toId → fetch top 2; only 1 row.
      db.where.mockReturnValueOnce(thenable([RUN_A]));

      await expect(service.compareProjectRuns('s1', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns an existing stored comparison instead of rebuilding', async () => {
      // resolveRuns: top 2 (rows[1] = baseline, rows[0] = target)
      db.where
        .mockReturnValueOnce(thenable([RUN_B, RUN_A]))
        // getStoredComparison: comparison exists
        .mockReturnValueOnce(
          thenable([
            {
              id: 'c1',
              baselineAuditRunId: 'r-old',
              targetAuditRunId: 'r-new',
              scoreDelta: -10,
              issuesDelta: 0,
              regressionsCount: 1,
              improvementsCount: 0,
            },
          ]),
        )
        // both runs present
        .mockReturnValueOnce(thenable([RUN_A]))
        .mockReturnValueOnce(thenable([RUN_B]))
        // changes
        .mockReturnValueOnce(thenable([]))
        // fromIssues + toIssues
        .mockReturnValueOnce(thenable([]))
        .mockReturnValueOnce(thenable([]));

      const out = await service.compareProjectRuns('s1', 'u1');

      // Cached comparison returned — no insert was called.
      expect(db.insert).not.toHaveBeenCalled();
      expect((out as { comparison?: { id: string } }).comparison?.id).toBe('c1');
    });
  });

  describe('listProjectComparisons', () => {
    it('returns an empty paginated list when no comparisons exist', async () => {
      db.where.mockReturnValueOnce(thenable([{ total: 0 }])).mockReturnValueOnce(thenable([]));

      await expect(
        service.listProjectComparisons('s1', 'u1', { limit: 10, offset: 5 }),
      ).resolves.toStrictEqual({
        items: [],
        limit: 10,
        offset: 5,
        total: 0,
      });
      expect(sites.getById).toHaveBeenCalledWith('s1', 'u1');
    });

    it('attaches baseline and target runs to stored comparisons', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ total: 1 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'c1',
              baselineAuditRunId: 'r-old',
              targetAuditRunId: 'r-new',
              siteId: 's1',
            },
          ]),
        )
        .mockReturnValueOnce(thenable([RUN_A, RUN_B]));

      const out = await service.listProjectComparisons('s1', 'u1');

      expect(out.items).toStrictEqual([
        expect.objectContaining({
          baselineRun: RUN_A,
          id: 'c1',
          targetRun: RUN_B,
        }),
      ]);
    });
  });

  describe('resolveRuns', () => {
    it('resolves explicit baseline and target ids regardless of query order', async () => {
      db.where.mockReturnValueOnce(thenable([RUN_B, RUN_A]));

      const [from, to] = await service.resolveRuns('s1', 'r-old', 'r-new');

      expect(from?.id).toBe('r-old');
      expect(to?.id).toBe('r-new');
    });
  });

  describe('persistComparisonForRun', () => {
    const site = { domain: 'example.com', id: 's1', name: 'Example', projectId: 'p1' };

    it('returns null until there are two completed runs including the target', async () => {
      db.where.mockReturnValueOnce(thenable([{ ...RUN_B, status: AuditStatus.COMPLETED }]));

      await expect(service.persistComparisonForRun({ site, targetRunId: 'r-new' })).resolves.toBe(
        null,
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns an existing comparison without rebuilding it', async () => {
      const existing = {
        id: 'c-existing',
        baselineAuditRunId: 'r-old',
        targetAuditRunId: 'r-new',
      };
      db.where
        .mockReturnValueOnce(
          thenable([
            { ...RUN_B, status: AuditStatus.COMPLETED },
            { ...RUN_A, status: AuditStatus.COMPLETED },
          ]),
        )
        .mockReturnValueOnce(thenable([existing]));

      await expect(service.persistComparisonForRun({ site, targetRunId: 'r-new' })).resolves.toBe(
        existing,
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('persists comparison rows and individual changes for a new target run', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            { ...RUN_B, status: AuditStatus.COMPLETED },
            { ...RUN_A, status: AuditStatus.COMPLETED },
          ]),
        )
        .mockReturnValueOnce(thenable([]))
        .mockReturnValueOnce(thenable([]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 'i1',
              issueCode: 'TITLE_MISSING',
              category: 'META',
              severity: Severity.CRITICAL,
              message: 'no title',
              resourceUrl: '/page-1',
            },
          ]),
        );
      db.returning.mockResolvedValueOnce([{ id: 'c-new' }]);

      await expect(
        service.persistComparisonForRun({ site, targetRunId: 'r-new' }),
      ).resolves.toStrictEqual({
        id: 'c-new',
      });

      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineAuditRunId: 'r-old',
          regressionsCount: 2,
          siteId: 's1',
          targetAuditRunId: 'r-new',
        }),
      );
      expect(db.values).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: ComparisonChangeType.SCORE_DROP,
            comparisonId: 'c-new',
          }),
          expect.objectContaining({
            changeType: ComparisonChangeType.NEW_ISSUE,
            comparisonId: 'c-new',
          }),
        ]),
      );
    });
  });
});
