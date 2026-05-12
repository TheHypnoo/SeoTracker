import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityAction,
  IssueCategory,
  IssueCode,
  IssueState,
  Permission,
  Severity,
} from '@seotracker/shared-types';

import { ACTIVITY_RECORDED_EVENT } from '../activity-log/activity-log.listener';
import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from '../projects/projects.service';
import { SitesService } from '../sites/sites.service';
import { ProjectIssuesService } from './site-issues.service';

function query<T>(rows: T) {
  return {
    groupBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function makeWriteBuilder() {
  return {
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  values: jest.Mock;
  transaction: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    transaction: jest.fn(),
  };
}

describe('projectIssuesService', () => {
  let service: ProjectIssuesService;
  let db: DbMock;
  let sites: { getById: jest.Mock; getByIdWithPermission: jest.Mock };
  let projects: { assertPermission: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    sites = {
      getById: jest.fn().mockResolvedValue({ id: 'site-1', projectId: 'project-1' }),
      getByIdWithPermission: jest.fn().mockResolvedValue({
        id: 'site-1',
        projectId: 'project-1',
      }),
    };
    projects = { assertPermission: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectIssuesService,
        { provide: DRIZZLE, useValue: db },
        { provide: SitesService, useValue: sites },
        { provide: ProjectsService, useValue: projects },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = moduleRef.get(ProjectIssuesService);
  });

  it('normalizes empty resources to the site-level fingerprint', () => {
    expect(ProjectIssuesService.fingerprintResource(null)).toBe('');
    expect(ProjectIssuesService.fingerprintResource('   ')).toBe('');
    expect(ProjectIssuesService.fingerprintResource(' https://example.com/a ')).toBe(
      'https://example.com/a',
    );
  });

  it('reconciles duplicate audit issues into persistent issue fingerprints', async () => {
    const txInsert = makeWriteBuilder();
    const txUpdate = makeWriteBuilder();
    const tx = {
      insert: jest.fn().mockReturnValue(txInsert),
      update: jest.fn().mockReturnValue(txUpdate),
    };
    db.where.mockReturnValueOnce(
      query([
        {
          issueCode: IssueCode.MISSING_TITLE,
          resourceUrl: 'https://example.com/a',
          severity: Severity.HIGH,
          category: IssueCategory.ON_PAGE,
          message: 'Missing title',
        },
        {
          issueCode: IssueCode.MISSING_TITLE,
          resourceUrl: ' https://example.com/a ',
          severity: Severity.HIGH,
          category: IssueCategory.ON_PAGE,
          message: 'Missing title',
        },
        {
          issueCode: IssueCode.PAGE_TOO_HEAVY,
          resourceUrl: null,
          severity: Severity.MEDIUM,
          category: IssueCategory.PERFORMANCE,
          message: 'Slow page',
        },
      ]),
    );
    db.transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<void>) =>
      callback(tx),
    );

    await service.reconcileAfterRun('site-1', 'run-1');

    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(txInsert.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        issueCode: IssueCode.MISSING_TITLE,
        lastSeenAuditRunId: 'run-1',
        occurrenceCount: 2,
        resourceKey: 'https://example.com/a',
        siteId: 'site-1',
        state: IssueState.OPEN,
      }),
    );
    expect(txInsert.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        issueCode: IssueCode.PAGE_TOO_HEAVY,
        occurrenceCount: 1,
        resourceKey: '',
      }),
    );
    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedAt: expect.any(Date), state: IssueState.FIXED }),
    );
  });

  it('lists project-scoped issues after asserting audit-read permission', async () => {
    db.where.mockReturnValueOnce(query([{ total: 2 }])).mockReturnValueOnce(
      query([
        {
          issue: { id: 'issue-1', siteId: 'site-1', severity: Severity.HIGH },
          siteDomain: 'example.com',
          siteName: 'Main site',
        },
      ]),
    );

    const out = await service.listForProjectScope('project-1', 'user-1', {
      pagination: { limit: 10, offset: 5 },
      severity: Severity.HIGH,
      state: IssueState.OPEN,
    });

    expect(projects.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.AUDIT_READ,
    );
    expect(out).toStrictEqual({
      items: [
        expect.objectContaining({
          id: 'issue-1',
          siteDomain: 'example.com',
          siteName: 'Main site',
        }),
      ],
      limit: 10,
      offset: 5,
      total: 2,
    });
  });

  it('returns ignored fingerprints for crawler suppression', async () => {
    db.where.mockReturnValueOnce(
      query([
        { issueCode: IssueCode.MISSING_TITLE, resourceKey: '' },
        { issueCode: IssueCode.BROKEN_LINK, resourceKey: 'https://example.com/b' },
      ]),
    );

    await expect(service.getIgnoredFingerprints('site-1')).resolves.toStrictEqual(
      new Set([`${IssueCode.MISSING_TITLE}::`, `${IssueCode.BROKEN_LINK}::https://example.com/b`]),
    );
  });

  it('sets an issue as ignored and emits project activity', async () => {
    const updated = {
      id: 'issue-1',
      issueCode: IssueCode.MISSING_TITLE,
      siteId: 'site-1',
      state: IssueState.IGNORED,
    };
    db.where
      .mockReturnValueOnce(query([{ id: 'issue-1', siteId: 'site-1' }]))
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(query([updated]))
      .mockReturnValueOnce(query([{ projectId: 'project-1' }]));

    const out = await service.setState('issue-1', 'user-1', IssueState.IGNORED);

    expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.ISSUE_UPDATE,
    );
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredAt: expect.any(Date),
        ignoredByUserId: 'user-1',
        state: IssueState.IGNORED,
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      ACTIVITY_RECORDED_EVENT,
      expect.objectContaining({
        action: ActivityAction.ISSUE_IGNORED,
        projectId: 'project-1',
        resourceId: 'issue-1',
        siteId: 'site-1',
      }),
    );
    expect(out).toBe(updated);
  });

  it('clears ignored metadata when restoring an issue to open', async () => {
    db.where
      .mockReturnValueOnce(query([{ id: 'issue-1', siteId: 'site-1' }]))
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(
        query([
          {
            id: 'issue-1',
            issueCode: IssueCode.MISSING_TITLE,
            siteId: 'site-1',
            state: IssueState.OPEN,
          },
        ]),
      )
      .mockReturnValueOnce(query([{ projectId: 'project-1' }]));

    await service.setState('issue-1', 'user-1', IssueState.OPEN);

    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredAt: null,
        ignoredByUserId: null,
        resolvedAt: null,
        state: IssueState.OPEN,
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      ACTIVITY_RECORDED_EVENT,
      expect.objectContaining({ action: ActivityAction.ISSUE_RESTORED }),
    );
  });

  it('throws not-found for unknown persistent issues', async () => {
    db.where.mockReturnValueOnce(query([]));

    await expect(service.setState('missing', 'user-1', IssueState.IGNORED)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps denied site permission checks to a forbidden issue update', async () => {
    db.where.mockReturnValueOnce(query([{ id: 'issue-1', siteId: 'site-1' }]));
    sites.getByIdWithPermission.mockRejectedValueOnce(new NotFoundException('Site not found'));

    await expect(service.setState('issue-1', 'user-1', IssueState.IGNORED)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
