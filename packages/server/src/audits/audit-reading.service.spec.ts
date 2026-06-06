import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AuditStatus,
  AuditTrigger,
  IndexabilityStatus,
  IssueCode,
  IssueState,
  Permission,
  Severity,
} from '@seotracker/shared-types';

import { AuditReadingService } from './audit-reading.service';

function query<T>(rows: T[]) {
  const builder = {
    from: jest.fn(() => builder),
    groupBy: jest.fn(() => Promise.resolve(rows)),
    innerJoin: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    offset: jest.fn(() => Promise.resolve(rows)),
    orderBy: jest.fn(() => builder),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    where: jest.fn(() => builder),
  };
  return builder;
}

const sitesService = {
  getByIdWithPermission: jest.fn().mockResolvedValue({
    domain: 'example.com',
    id: 'site-1',
    name: 'Example',
  }),
};
const projectsService = { assertMember: jest.fn(), assertPermission: jest.fn() };

function makeService(db: { select: jest.Mock }) {
  return new AuditReadingService(db as never, sitesService as never, projectsService as never);
}

describe('auditReadingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists site audit runs with aggregate issue counts', async () => {
    const run = {
      createdAt: new Date('2026-05-08T10:00:00.000Z'),
      id: 'run-1',
      siteId: 'site-1',
      status: AuditStatus.COMPLETED,
      trigger: AuditTrigger.MANUAL,
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ total: 1 }]))
        .mockReturnValueOnce(query([run]))
        .mockReturnValueOnce(query([{ auditRunId: 'run-1', total: 3 }]))
        .mockReturnValueOnce(query([{ auditRunId: 'run-1', total: 1 }])),
    };

    await expect(
      makeService(db).listProjectRuns('site-1', 'user-1', {
        from: '2026-05-01',
        pagination: { limit: 10, offset: 0 },
        status: AuditStatus.COMPLETED,
        to: '2026-05-09',
        trigger: AuditTrigger.MANUAL,
      }),
    ).resolves.toMatchObject({
      items: [{ criticalIssuesCount: 1, id: 'run-1', issuesCount: 3 }],
      limit: 10,
      offset: 0,
      total: 1,
    });
    expect(sitesService.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.AUDIT_READ,
    );
  });

  it('returns empty site audit runs with default pagination and no aggregate queries', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(query([])).mockReturnValueOnce(query([])),
    };

    await expect(makeService(db).listProjectRuns('site-1', 'user-1')).resolves.toStrictEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('ignores invalid date filters for site audit runs', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ total: 0 }]))
        .mockReturnValueOnce(query([])),
    };

    await expect(
      makeService(db).listProjectRuns('site-1', 'user-1', {
        from: 'not-a-date',
        to: 'still-not-a-date',
      }),
    ).resolves.toMatchObject({ items: [], total: 0 });
  });

  it('lists project audit runs with site labels and aggregate counts', async () => {
    const run = { id: 'run-1', siteId: 'site-1', status: AuditStatus.COMPLETED };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ total: 1 }]))
        .mockReturnValueOnce(query([{ run, siteDomain: 'example.com', siteName: 'Example' }]))
        .mockReturnValueOnce(query([{ auditRunId: 'run-1', total: 2 }]))
        .mockReturnValueOnce(query([{ auditRunId: 'run-1', total: 1 }])),
    };

    await expect(
      makeService(db).listAuditsForProject('project-1', 'user-1', {
        pagination: { limit: 5, offset: 5 },
        siteId: 'site-1',
        status: AuditStatus.COMPLETED,
        trigger: AuditTrigger.MANUAL,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          criticalIssuesCount: 1,
          id: 'run-1',
          issuesCount: 2,
          siteDomain: 'example.com',
          siteName: 'Example',
        },
      ],
      total: 1,
    });
    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.AUDIT_READ,
    );
  });

  it('returns empty project audit runs with default pagination and no aggregate queries', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(query([])).mockReturnValueOnce(query([])),
    };

    await expect(
      makeService(db).listAuditsForProject('project-1', 'user-1'),
    ).resolves.toStrictEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('throws when audit details are missing', async () => {
    const db = { select: jest.fn().mockReturnValueOnce(query([])) };

    await expect(makeService(db).getAuditRun('missing', 'user-1')).rejects.toThrow(
      'Audit not found',
    );
  });

  it('returns audit details with metrics, pages, severity counts and score delta', async () => {
    const run = {
      categoryScores: { technical: 80 },
      createdAt: new Date('2026-05-08T10:00:00.000Z'),
      finishedAt: new Date('2026-05-08T10:02:00.000Z'),
      httpStatus: 200,
      id: 'run-1',
      responseMs: 120,
      score: 80,
      scoreBreakdown: {},
      siteId: 'site-1',
      startedAt: new Date('2026-05-08T10:00:00.000Z'),
      status: AuditStatus.COMPLETED,
      trigger: AuditTrigger.MANUAL,
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([run]))
        .mockReturnValueOnce(query([{ name: 'pages', value: 3 }]))
        .mockReturnValueOnce(query([{ url: 'https://example.com' }]))
        .mockReturnValueOnce(query([{ severity: Severity.CRITICAL, total: 1 }]))
        .mockReturnValueOnce(query([{ score: 70 }])),
    };

    await expect(makeService(db).getAuditRun('run-1', 'user-1')).resolves.toMatchObject({
      failureReason: null,
      issuesCount: 1,
      previousScore: 70,
      scoreDelta: 10,
      severityCounts: { [Severity.CRITICAL]: 1 },
      site: { domain: 'example.com', id: 'site-1', name: 'Example' },
    });
  });

  it('returns failed audit details with failure reason and null delta fallback', async () => {
    const run = {
      categoryScores: {},
      createdAt: new Date('2026-05-08T10:00:00.000Z'),
      finishedAt: null,
      httpStatus: 500,
      id: 'run-1',
      responseMs: null,
      score: null,
      scoreBreakdown: {},
      siteId: 'site-1',
      startedAt: new Date('2026-05-08T10:00:00.000Z'),
      status: AuditStatus.FAILED,
      trigger: AuditTrigger.MANUAL,
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([run]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([{ payload: { reason: 'crawler failed' } }]))
        .mockReturnValueOnce(query([])),
    };

    await expect(makeService(db).getAuditRun('run-1', 'user-1')).resolves.toMatchObject({
      failureReason: 'crawler failed',
      issuesCount: 0,
      previousScore: null,
      scoreDelta: null,
    });
  });

  it('throws when audit issues run is missing', async () => {
    const db = { select: jest.fn().mockReturnValueOnce(query([])) };

    await expect(makeService(db).getAuditIssues('missing', 'user-1')).rejects.toThrow(
      'Audit not found',
    );
  });

  it('returns audit issues enriched with project issue state', async () => {
    const issue = {
      id: 'issue-1',
      issueCode: IssueCode.MISSING_TITLE,
      resourceUrl: 'https://example.com/',
    };
    const firstSeenAt = new Date('2026-05-01T10:00:00.000Z');
    const lastSeenAt = new Date('2026-05-08T10:00:00.000Z');
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ siteId: 'site-1' }]))
        .mockReturnValueOnce(query([{ total: 1 }]))
        .mockReturnValueOnce(query([issue]))
        .mockReturnValueOnce(
          query([
            {
              firstSeenAt,
              id: 'project-issue-1',
              issueCode: IssueCode.MISSING_TITLE,
              lastSeenAt,
              resourceKey: 'https://example.com/',
              state: IssueState.OPEN,
            },
          ]),
        ),
    };

    await expect(
      makeService(db).getAuditIssues('run-1', 'user-1', { limit: 10, offset: 0 }),
    ).resolves.toStrictEqual({
      items: [
        {
          ...issue,
          firstSeenAt,
          lastSeenAt,
          projectIssueId: 'project-issue-1',
          state: IssueState.OPEN,
        },
      ],
      limit: 10,
      offset: 0,
      total: 1,
    });
  });

  it('returns audit issues without state rows using default pagination', async () => {
    const issue = { id: 'issue-1', issueCode: IssueCode.MISSING_TITLE, resourceUrl: null };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ siteId: 'site-1' }]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([issue]))
        .mockReturnValueOnce(query([])),
    };

    await expect(makeService(db).getAuditIssues('run-1', 'user-1')).resolves.toStrictEqual({
      items: [
        {
          ...issue,
          firstSeenAt: null,
          lastSeenAt: null,
          projectIssueId: null,
          state: null,
        },
      ],
      limit: 50,
      offset: 0,
      total: 0,
    });
  });

  it('returns trend points ordered chronologically with deltas', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        query([
          {
            categoryScores: {},
            createdAt: new Date('2026-05-08T10:00:00.000Z'),
            finishedAt: null,
            id: 'newer',
            score: 80,
          },
          {
            categoryScores: {},
            createdAt: new Date('2026-05-07T10:00:00.000Z'),
            finishedAt: null,
            id: 'older',
            score: 70,
          },
        ]),
      ),
    };

    await expect(makeService(db).getProjectTrends('site-1', 'user-1', 2)).resolves.toMatchObject({
      points: [
        { id: 'older', score: 70, scoreDelta: null },
        { id: 'newer', score: 80, scoreDelta: 10 },
      ],
    });
  });

  it('uses default trend limit and finishedAt timestamp when available', async () => {
    const finishedAt = new Date('2026-05-08T11:00:00.000Z');
    const db = {
      select: jest.fn().mockReturnValueOnce(
        query([
          {
            categoryScores: {},
            createdAt: new Date('2026-05-08T10:00:00.000Z'),
            finishedAt,
            id: 'run-1',
            score: null,
          },
        ]),
      ),
    };

    await expect(makeService(db).getProjectTrends('site-1', 'user-1')).resolves.toStrictEqual({
      points: [
        {
          categoryScores: {},
          id: 'run-1',
          score: null,
          scoreDelta: null,
          timestamp: finishedAt.toISOString(),
        },
      ],
    });
  });

  it('throws when audit indexability run is missing', async () => {
    const db = { select: jest.fn().mockReturnValueOnce(query([])) };

    await expect(makeService(db).getAuditIndexability('missing', 'user-1')).rejects.toThrow(
      'Audit not found',
    );
  });

  it('returns audit indexability with filters and pagination', async () => {
    const inspection = { id: 'url-1', source: 'sitemap' };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ siteId: 'site-1' }]))
        .mockReturnValueOnce(query([{ total: 1 }]))
        .mockReturnValueOnce(query([inspection])),
    };

    await expect(
      makeService(db).getAuditIndexability('run-1', 'user-1', {
        indexabilityStatus: IndexabilityStatus.UNKNOWN,
        pagination: { limit: 2, offset: 4 },
        source: 'sitemap',
      }),
    ).resolves.toStrictEqual({ items: [inspection], limit: 2, offset: 4, total: 1 });
  });

  it('returns audit indexability with default filters and empty total fallback', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(query([{ siteId: 'site-1' }]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([])),
    };

    await expect(makeService(db).getAuditIndexability('run-1', 'user-1')).resolves.toStrictEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
  });
});
