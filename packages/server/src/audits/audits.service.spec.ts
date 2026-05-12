import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuditsService } from './audits.service';

describe('AuditsService', () => {
  const orchestrationService = {
    reconcileQueuedRuns: jest.fn(),
    runManual: jest.fn(),
    runScheduled: jest.fn(),
    runWebhook: jest.fn(),
  };
  const processingService = { processQueuedRun: jest.fn() };
  const comparisonService = {
    compareProjectRuns: jest.fn(),
    listProjectComparisons: jest.fn(),
  };
  const readingService = {
    getAuditIssues: jest.fn(),
    getAuditRun: jest.fn(),
    getProjectTrends: jest.fn(),
    listAuditsForProject: jest.fn(),
    listProjectRuns: jest.fn(),
  };
  const actionPlanService = {
    getForAudit: jest.fn(),
    getForSite: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates run and queue operations to orchestration/processing services', () => {
    const service = new AuditsService(
      orchestrationService as never,
      processingService as never,
      comparisonService as never,
      readingService as never,
      actionPlanService as never,
    );

    service.runManual('site-1', 'user-1');
    service.runScheduled('site-1');
    service.runWebhook('site-1');
    service.processQueuedRun('audit-1', 2);
    service.reconcileQueuedRuns({ limit: 5 });

    expect(orchestrationService.runManual).toHaveBeenCalledWith('site-1', 'user-1');
    expect(orchestrationService.runScheduled).toHaveBeenCalledWith('site-1');
    expect(orchestrationService.runWebhook).toHaveBeenCalledWith('site-1');
    expect(processingService.processQueuedRun).toHaveBeenCalledWith('audit-1', 2);
    expect(orchestrationService.reconcileQueuedRuns).toHaveBeenCalledWith({ limit: 5 });
  });

  it('delegates read, action plan and comparison operations', () => {
    const service = new AuditsService(
      orchestrationService as never,
      processingService as never,
      comparisonService as never,
      readingService as never,
      actionPlanService as never,
    );

    service.listProjectRuns('site-1', 'user-1', { pagination: { limit: 10, offset: 0 } });
    service.listAuditsForProject('project-1', 'user-1');
    service.getAuditRun('audit-1', 'user-1');
    service.getAuditIssues('audit-1', 'user-1', { limit: 10, offset: 0 });
    service.getSiteActionPlan('site-1', 'user-1');
    service.getAuditActionPlan('audit-1', 'user-1');
    service.getProjectTrends('site-1', 'user-1', 5);
    service.compareProjectRuns('site-1', 'user-1', 'from-1', 'to-1');
    service.listProjectComparisons('site-1', 'user-1', { limit: 10, offset: 0 });

    expect(readingService.listProjectRuns).toHaveBeenCalledWith('site-1', 'user-1', {
      pagination: { limit: 10, offset: 0 },
    });
    expect(readingService.listAuditsForProject).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      undefined,
    );
    expect(readingService.getAuditRun).toHaveBeenCalledWith('audit-1', 'user-1');
    expect(readingService.getAuditIssues).toHaveBeenCalledWith('audit-1', 'user-1', {
      limit: 10,
      offset: 0,
    });
    expect(actionPlanService.getForSite).toHaveBeenCalledWith('site-1', 'user-1');
    expect(actionPlanService.getForAudit).toHaveBeenCalledWith('audit-1', 'user-1');
    expect(readingService.getProjectTrends).toHaveBeenCalledWith('site-1', 'user-1', 5);
    expect(comparisonService.compareProjectRuns).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      'from-1',
      'to-1',
    );
    expect(comparisonService.listProjectComparisons).toHaveBeenCalledWith('site-1', 'user-1', {
      limit: 10,
      offset: 0,
    });
  });
});
