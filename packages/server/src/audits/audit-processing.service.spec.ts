import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditStatus,
  IssueCategory,
  IssueCode,
  OutboundEvent,
  Severity,
} from '@seotracker/shared-types';

import { AlertsService } from '../alerts/alerts.service';
import { DRIZZLE } from '../database/database.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { QueueService } from '../queue/queue.service';
import { SeoEngineService } from '../seo-engine/seo-engine.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuditComparisonService } from './audit-comparison.service';
import { CrawlConfigService } from '../sites/crawl-config.service';
import { AuditOrchestrationService } from './audit-orchestration.service';
import { AuditProcessingService } from './audit-processing.service';
import { ProjectIssuesService } from './site-issues.service';

// Drizzle's where(...) is sometimes awaited directly, sometimes followed by
// .limit(). thenable() lets a single mock return value satisfy both.
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
  insert: jest.Mock;
  values: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  transaction: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    transaction: jest.fn(),
  };
}

const SAMPLE_ANALYSIS = {
  httpStatus: 200,
  responseMs: 120,
  score: 90,
  categoryScores: { content: 90 },
  scoreBreakdown: {
    perSeverity: {},
    totalDeduction: 10,
  },
  pages: [
    { url: 'https://x.test/', statusCode: 200, responseMs: 50, contentType: 'html', score: 90 },
  ],
  metrics: [],
  issues: [
    {
      issueCode: IssueCode.MISSING_TITLE,
      category: IssueCategory.ON_PAGE,
      severity: Severity.HIGH,
      message: 'm',
      resourceUrl: null,
      meta: null,
    },
  ],
  urlInspections: [],
};

describe('AuditProcessingService', () => {
  let service: AuditProcessingService;
  let db: DbMock;
  let queue: { enqueueAuditRun: jest.Mock };
  let seo: { analyzeDomain: jest.Mock };
  let notifications: { createForProjectMembers: jest.Mock; sendEmailToProjectMembers: jest.Mock };
  let alerts: { evaluateRegression: jest.Mock };
  let systemLogs: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
  let orchestration: { markRunFailed: jest.Mock };
  let comparison: { persistComparisonForRun: jest.Mock };
  let outbound: { dispatch: jest.Mock };
  let projectIssues: {
    reconcileAfterRun: jest.Mock;
    getIgnoredFingerprints: jest.Mock;
    fingerprintResource?: jest.Mock;
  };

  beforeEach(async () => {
    db = makeDb();
    queue = { enqueueAuditRun: jest.fn().mockResolvedValue(undefined) };
    seo = { analyzeDomain: jest.fn().mockResolvedValue({ ...SAMPLE_ANALYSIS }) };
    notifications = {
      createForProjectMembers: jest.fn().mockResolvedValue(undefined),
      sendEmailToProjectMembers: jest.fn().mockResolvedValue(undefined),
    };
    alerts = { evaluateRegression: jest.fn().mockResolvedValue(undefined) };
    systemLogs = {
      warn: jest.fn().mockResolvedValue(undefined),
      info: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
    };
    orchestration = { markRunFailed: jest.fn().mockResolvedValue(undefined) };
    comparison = { persistComparisonForRun: jest.fn().mockResolvedValue(null) };
    outbound = { dispatch: jest.fn().mockResolvedValue(undefined) };
    projectIssues = {
      reconcileAfterRun: jest.fn().mockResolvedValue(undefined),
      getIgnoredFingerprints: jest.fn().mockResolvedValue(new Set<string>()),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditProcessingService,
        { provide: DRIZZLE, useValue: db },
        { provide: QueueService, useValue: queue },
        { provide: SeoEngineService, useValue: seo },
        { provide: NotificationsService, useValue: notifications },
        { provide: AlertsService, useValue: alerts },
        { provide: SystemLogsService, useValue: systemLogs },
        { provide: AuditOrchestrationService, useValue: orchestration },
        { provide: AuditComparisonService, useValue: comparison },
        { provide: OutboundWebhooksService, useValue: outbound },
        { provide: ProjectIssuesService, useValue: projectIssues },
        {
          provide: CrawlConfigService,
          useValue: {
            resolve: jest.fn().mockResolvedValue({
              maxPages: 50,
              maxDepth: 2,
              maxConcurrentPages: 5,
              requestDelayMs: 0,
              respectCrawlDelay: true,
              userAgent: null,
            }),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AuditProcessingService);
  });

  describe('processQueuedRun — gating', () => {
    it('logs and returns when the run does not exist', async () => {
      db.where.mockReturnValueOnce(thenable([])); // initial select returns no row

      await service.processQueuedRun('missing-id', 1);

      expect(systemLogs.warn).toHaveBeenCalledWith(
        'AuditProcessingService',
        expect.stringContaining('not found'),
        expect.objectContaining({ auditRunId: 'missing-id' }),
      );
      // Critical: nothing else fires, no SEO call, no notifications.
      expect(seo.analyzeDomain).not.toHaveBeenCalled();
      expect(orchestration.markRunFailed).not.toHaveBeenCalled();
    });

    it('returns silently when run is not in QUEUED status (already running / finished)', async () => {
      db.where.mockReturnValueOnce(
        thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.RUNNING, trigger: 'MANUAL' }]),
      );

      await service.processQueuedRun('r1', 1);

      expect(seo.analyzeDomain).not.toHaveBeenCalled();
      expect(systemLogs.warn).not.toHaveBeenCalled();
    });

    it('re-enqueues with delay when per-project concurrency would be exceeded', async () => {
      db.where
        // Initial run lookup
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        // Concurrency count query: 1 already running, perProjectConcurrency=1 → throttle
        .mockReturnValueOnce(thenable([{ total: 1 }]));

      await service.processQueuedRun('r1', 1);

      expect(queue.enqueueAuditRun).toHaveBeenCalledWith(
        { auditRunId: 'r1', siteId: 's1' },
        { delayMs: 15_000 },
      );
      expect(seo.analyzeDomain).not.toHaveBeenCalled();
    });

    it('marks run failed when the parent site cannot be located', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        .mockReturnValueOnce(thenable([{ total: 0 }])) // concurrency OK
        .mockReturnValueOnce(thenable([])); // site lookup empty

      await service.processQueuedRun('r1', 5);

      expect(orchestration.markRunFailed).toHaveBeenCalledWith('r1', 'Site not found');
      expect(seo.analyzeDomain).not.toHaveBeenCalled();
    });
  });

  describe('processQueuedRun — error paths', () => {
    it('marks run FAILED and dispatches AUDIT_FAILED webhook when analysis throws', async () => {
      // run + concurrency + site queries all OK, then SEO throws.
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        .mockReturnValueOnce(thenable([{ total: 0 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 's1',
              projectId: 'p1',
              name: 'Site',
              domain: 'x.test',
              normalizedDomain: 'x.test',
            },
          ]),
        )
        // The status update + audit_event insert in the orchestrating block
        // each end with .where(...) that we don't need to assert here.
        .mockReturnValueOnce(undefined as unknown as never);

      seo.analyzeDomain.mockRejectedValueOnce(new Error('boom'));

      await service.processQueuedRun('r1', 5);

      expect(orchestration.markRunFailed).toHaveBeenCalledWith(
        'r1',
        expect.stringContaining('boom'),
        expect.any(Error),
      );
      // AUDIT_FAILED webhook attempted (dispatched even if dispatcher itself errors).
      const events = outbound.dispatch.mock.calls.map((c) => c[0]?.event);
      expect(events).toContain('audit.failed');
    });
  });

  describe('processQueuedRun — successful side effects', () => {
    it('persists metrics, rescores ignored issues and dispatches critical/regression webhooks', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        .mockReturnValueOnce(thenable([{ total: 0 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 's1',
              projectId: 'p1',
              name: 'Site',
              domain: 'x.test',
              normalizedDomain: 'x.test',
            },
          ]),
        );
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      };
      db.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
      seo.analyzeDomain.mockResolvedValueOnce({
        ...SAMPLE_ANALYSIS,
        metrics: [{ key: 'pages_total', valueNum: 1, valueText: null }],
        issues: [
          {
            issueCode: IssueCode.MISSING_TITLE,
            category: IssueCategory.ON_PAGE,
            severity: Severity.HIGH,
            message: 'ignored title',
            resourceUrl: null,
            meta: null,
          },
          {
            issueCode: IssueCode.META_NOINDEX,
            category: IssueCategory.CRAWLABILITY,
            severity: Severity.CRITICAL,
            message: 'critical',
            resourceUrl: 'https://x.test/',
            meta: null,
          },
        ],
      });
      projectIssues.getIgnoredFingerprints.mockResolvedValueOnce(
        new Set([`${IssueCode.MISSING_TITLE}::`]),
      );
      comparison.persistComparisonForRun.mockResolvedValueOnce({
        id: 'comparison-1',
        scoreDelta: -12,
      });

      await service.processQueuedRun('r1', 5);

      expect(db.transaction).toHaveBeenCalledTimes(2);
      expect(alerts.evaluateRegression).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's1', projectId: 'p1' }),
        expect.objectContaining({ id: 'comparison-1', scoreDelta: -12 }),
      );
      const events = outbound.dispatch.mock.calls.map((call) => call[0]?.event);
      expect(events).toStrictEqual(
        expect.arrayContaining([
          OutboundEvent.AUDIT_COMPLETED,
          OutboundEvent.ISSUE_CRITICAL,
          OutboundEvent.SITE_REGRESSION,
        ]),
      );
      expect(notifications.createForProjectMembers).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'AUDIT_COMPLETED' }),
      );
      expect(orchestration.markRunFailed).not.toHaveBeenCalled();
    });
  });

  describe('processQueuedRun — B3: reconcile / rescore failures stay non-fatal but are surfaced', () => {
    it('surfaces reconcile failure to system_logs.warn (does not abort run)', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        .mockReturnValueOnce(thenable([{ total: 0 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 's1',
              projectId: 'p1',
              name: 'Site',
              domain: 'x.test',
              normalizedDomain: 'x.test',
            },
          ]),
        );
      // The two trailing .where() calls (status update + event insert use returning chain)
      // resolve to whatever — the service does not consume them. Default mock returns undefined.
      db.where.mockReturnValue(undefined as unknown as never);

      // Persist transaction is happy.
      db.transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) =>
        cb({
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      );

      // Reconcile throws → must be surfaced to system_logs.warn AND not abort the run.
      projectIssues.reconcileAfterRun.mockRejectedValueOnce(new Error('reconcile broke'));
      // Rescore happy path (no ignored fingerprints) so the second try/catch is a noop.
      projectIssues.getIgnoredFingerprints.mockResolvedValueOnce(new Set());

      await service.processQueuedRun('r1', 5);

      // Critical assertion for B3: warning logged with the expected shape.
      expect(systemLogs.warn).toHaveBeenCalledWith(
        'AuditProcessingService',
        expect.stringContaining('reconcile site issues'),
        expect.objectContaining({
          auditRunId: 'r1',
          siteId: 's1',
          error: expect.stringContaining('reconcile broke'),
        }),
      );
      // Run was NOT aborted: AUDIT_COMPLETED webhook still fires.
      const events = outbound.dispatch.mock.calls.map((c) => c[0]?.event);
      expect(events).toContain('audit.completed');
      // markRunFailed was NOT called for a post-processing failure.
      expect(orchestration.markRunFailed).not.toHaveBeenCalled();
    });

    it('surfaces rescore failure to system_logs.warn (does not abort run)', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'r1', siteId: 's1', status: AuditStatus.QUEUED, trigger: 'MANUAL' }]),
        )
        .mockReturnValueOnce(thenable([{ total: 0 }]))
        .mockReturnValueOnce(
          thenable([
            {
              id: 's1',
              projectId: 'p1',
              name: 'Site',
              domain: 'x.test',
              normalizedDomain: 'x.test',
            },
          ]),
        );
      db.where.mockReturnValue(undefined as unknown as never);
      db.transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) =>
        cb({
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      );

      // Reconcile happy.
      projectIssues.reconcileAfterRun.mockResolvedValueOnce(undefined);
      // Trigger the rescore branch by returning a non-empty Set.
      projectIssues.getIgnoredFingerprints.mockResolvedValueOnce(new Set(['TITLE::']));
      // Force the rescore inner block to throw at the FIRST DB transaction call
      // (the rescore transaction) — chain it via mockImplementationOnce.
      let txCalls = 0;
      db.transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => {
        txCalls += 1;
        if (txCalls === 1) {
          return cb({
            update: jest.fn().mockReturnValue({
              set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
            }),
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
          });
        }
        // Second transaction (rescore) explodes.
        throw new Error('rescore broke');
      });

      await service.processQueuedRun('r1', 5);

      expect(systemLogs.warn).toHaveBeenCalledWith(
        'AuditProcessingService',
        expect.stringContaining('rescore'),
        expect.objectContaining({
          auditRunId: 'r1',
          siteId: 's1',
          error: expect.stringContaining('rescore broke'),
        }),
      );
      // Run still completes externally.
      const events = outbound.dispatch.mock.calls.map((c) => c[0]?.event);
      expect(events).toContain('audit.completed');
    });
  });
});
