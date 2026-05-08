import { ComparisonChangeType, Permission, Severity } from '@seotracker/shared-types';

import {
  AlertsService,
  buildAuditRegressionSignals,
  formatAuditRegressionNotificationBody,
} from './alerts.service';

jest.mock('../notifications/email-templates', () => ({
  renderAuditRegressionEmail: jest.fn().mockResolvedValue({
    html: '<p>regression</p>',
    subject: 'Regression',
    text: 'regression',
  }),
}));

function selectRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function selectDirectRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(rows),
    }),
  };
}

function insertRows(rows: unknown[]) {
  return {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(rows),
    }),
  };
}

describe('alerts regression helpers', () => {
  it('builds score, critical issue and issue count signals', () => {
    const signals = buildAuditRegressionSignals({
      issuesDelta: 3,
      newCriticalIssuesCount: 1,
      notifyOnIssueCountIncrease: true,
      notifyOnNewCriticalIssues: true,
      notifyOnScoreDrop: true,
      scoreDelta: -8,
      scoreDropThreshold: 5,
    });

    expect(signals.map((signal) => signal.title)).toEqual([
      'Score SEO en descenso',
      'Nuevas incidencias críticas',
      'Aumento del volumen de incidencias',
    ]);
    expect(formatAuditRegressionNotificationBody('example.com', signals)).toContain(
      'Score SEO en descenso',
    );
  });

  it('returns no signals when all configured thresholds are clean', () => {
    expect(
      buildAuditRegressionSignals({
        issuesDelta: 0,
        newCriticalIssuesCount: 0,
        notifyOnIssueCountIncrease: true,
        notifyOnNewCriticalIssues: true,
        notifyOnScoreDrop: true,
        scoreDelta: -2,
        scoreDropThreshold: 5,
      }),
    ).toEqual([]);
  });
});

describe('AlertsService', () => {
  const sitesService = { getByIdWithPermission: jest.fn() };
  const notificationsService = {
    createForProjectMembers: jest.fn(),
    sendEmailToProjectMembers: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets or creates alert rules after checking read permission', async () => {
    const db = {
      insert: jest.fn().mockReturnValue(insertRows([{ id: 'rule-1', siteId: 'site-1' }])),
      select: jest.fn().mockReturnValueOnce(selectRows([])),
    };
    const service = new AlertsService(
      db as never,
      sitesService as never,
      notificationsService as never,
    );

    await expect(service.getForProject('site-1', 'user-1')).resolves.toEqual({
      id: 'rule-1',
      siteId: 'site-1',
    });
    expect(sitesService.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.ALERT_READ,
    );
  });

  it('returns null when regression alerts are disabled or no signal is triggered', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(selectRows([{ enabled: false, siteId: 'site-1' }])),
    };
    const service = new AlertsService(
      db as never,
      sitesService as never,
      notificationsService as never,
    );

    await expect(
      service.evaluateRegression(
        { domain: 'example.com', id: 'site-1', name: 'Example', projectId: 'project-1' },
        { id: 'comparison-1', issuesDelta: 0, regressionsCount: 0, scoreDelta: 0 },
      ),
    ).resolves.toBeNull();
  });

  it('notifies project members when regression signals are triggered', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          selectRows([
            {
              enabled: true,
              notifyOnIssueCountIncrease: true,
              notifyOnNewCriticalIssues: true,
              notifyOnScoreDrop: true,
              scoreDropThreshold: 5,
              siteId: 'site-1',
            },
          ]),
        )
        .mockReturnValueOnce(
          selectDirectRows([
            {
              changeType: ComparisonChangeType.NEW_ISSUE,
              severity: Severity.CRITICAL,
            },
          ]),
        ),
    };
    const service = new AlertsService(
      db as never,
      sitesService as never,
      notificationsService as never,
    );

    const result = await service.evaluateRegression(
      { domain: 'example.com', id: 'site-1', name: 'Example', projectId: 'project-1' },
      { id: 'comparison-1', issuesDelta: 2, regressionsCount: 1, scoreDelta: -6 },
    );

    expect(result?.triggered).toBe(true);
    expect(notificationsService.createForProjectMembers).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ type: 'AUDIT_REGRESSION' }),
    );
    expect(notificationsService.sendEmailToProjectMembers).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ subject: 'Regression' }),
      { bestEffort: true, notificationType: 'AUDIT_REGRESSION' },
    );
  });
});
