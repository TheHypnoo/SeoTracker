import { AuditsController } from './audits.controller';

describe('AuditsController', () => {
  const auditsService = {
    getAuditActionPlan: jest.fn(),
    getAuditIndexability: jest.fn(),
    getAuditIssues: jest.fn(),
    getAuditRun: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates audit detail reads to AuditsService', () => {
    const controller = new AuditsController(auditsService as never);

    controller.getAudit({ sub: 'user-1' }, 'audit-1');

    expect(auditsService.getAuditRun).toHaveBeenCalledWith('audit-1', 'user-1');
  });

  it('delegates audit issue reads with resolved pagination', () => {
    const controller = new AuditsController(auditsService as never);

    controller.getIssues({ sub: 'user-1' }, 'audit-1', { limit: 10, offset: 5 });

    expect(auditsService.getAuditIssues).toHaveBeenCalledWith('audit-1', 'user-1', {
      limit: 10,
      offset: 5,
    });
  });

  it('delegates audit action plan reads', () => {
    const controller = new AuditsController(auditsService as never);

    controller.getActionPlan({ sub: 'user-1' }, 'audit-1');

    expect(auditsService.getAuditActionPlan).toHaveBeenCalledWith('audit-1', 'user-1');
  });

  it('delegates audit indexability reads with filters and pagination', () => {
    const controller = new AuditsController(auditsService as never);

    controller.getIndexability({ sub: 'user-1' }, 'audit-1', {
      indexabilityStatus: 'NOINDEX' as never,
      limit: 20,
      offset: 10,
      source: 'crawl',
    });

    expect(auditsService.getAuditIndexability).toHaveBeenCalledWith('audit-1', 'user-1', {
      indexabilityStatus: 'NOINDEX',
      pagination: { limit: 20, offset: 10 },
      source: 'crawl',
    });
  });
});
