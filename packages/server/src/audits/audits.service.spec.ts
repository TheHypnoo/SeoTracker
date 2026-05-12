import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuditsService } from './audits.service';

describe('auditsService', () => {
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

  function makeService() {
    return new AuditsService(
      orchestrationService as never,
      processingService as never,
      comparisonService as never,
      readingService as never,
      actionPlanService as never,
    );
  }

  it('delegates run operations to orchestration service', () => {
    const service = makeService();
    service.runManual('site-1', 'user-1');
    service.runScheduled('site-1');
    service.runWebhook('site-1');

    expect(orchestrationService.runManual).toHaveBeenCalledWith('site-1', 'user-1');
    expect(orchestrationService.runScheduled).toHaveBeenCalledWith('site-1');
    expect(orchestrationService.runWebhook).toHaveBeenCalledWith('site-1');
  });

  it('delegates queue operations to processing and orchestration services', () => {
    const service = makeService();
    service.processQueuedRun('audit-1', 2);
    service.reconcileQueuedRuns({ limit: 5 });

    expect(processingService.processQueuedRun).toHaveBeenCalledWith('audit-1', 2);
    expect(orchestrationService.reconcileQueuedRuns).toHaveBeenCalledWith({ limit: 5 });
  });

  it('delegates read operations to reading service', () => {
    const service = makeService();
    service.listProjectRuns('site-1', 'user-1', { pagination: { limit: 10, offset: 0 } });
    service.listAuditsForProject('project-1', 'user-1');
    service.getAuditRun('audit-1', 'user-1');
    service.getAuditIssues('audit-1', 'user-1', { limit: 10, offset: 0 });
    service.getProjectTrends('site-1', 'user-1', 5);

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
    expect(readingService.getProjectTrends).toHaveBeenCalledWith('site-1', 'user-1', 5);
  });

  it('delegates action plan operations to action plan service', () => {
    const service = makeService();
    service.getSiteActionPlan('site-1', 'user-1');
    service.getAuditActionPlan('audit-1', 'user-1');

    expect(actionPlanService.getForSite).toHaveBeenCalledWith('site-1', 'user-1');
    expect(actionPlanService.getForAudit).toHaveBeenCalledWith('audit-1', 'user-1');
  });

  it('delegates comparison operations to comparison service', () => {
    const service = makeService();
    service.compareProjectRuns('site-1', 'user-1', 'from-1', 'to-1');
    service.listProjectComparisons('site-1', 'user-1', { limit: 10, offset: 0 });

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
