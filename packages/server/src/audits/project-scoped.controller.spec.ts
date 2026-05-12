import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AuditStatus,
  AuditTrigger,
  IssueCategory,
  IssueState,
  Severity,
} from '@seotracker/shared-types';

import { ProjectScopedAuditsController } from './project-scoped.controller';

describe('projectScopedAuditsController', () => {
  const auditsService = { listAuditsForProject: jest.fn() };
  const issuesService = { listForProjectScope: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists project audits with filters and resolved pagination', () => {
    const controller = new ProjectScopedAuditsController(
      auditsService as never,
      issuesService as never,
    );

    controller.listAudits({ sub: 'user-1' }, 'project-1', {
      limit: 10,
      offset: 5,
      siteId: 'site-1',
      status: AuditStatus.COMPLETED,
      trigger: AuditTrigger.MANUAL,
    });

    expect(auditsService.listAuditsForProject).toHaveBeenCalledWith('project-1', 'user-1', {
      pagination: { limit: 10, offset: 5 },
      siteId: 'site-1',
      status: AuditStatus.COMPLETED,
      trigger: AuditTrigger.MANUAL,
    });
  });

  it('lists project issues with filters and resolved pagination', () => {
    const controller = new ProjectScopedAuditsController(
      auditsService as never,
      issuesService as never,
    );

    controller.listIssues({ sub: 'user-1' }, 'project-1', {
      category: IssueCategory.TECHNICAL,
      limit: 20,
      offset: 0,
      severity: Severity.HIGH,
      siteId: 'site-1',
      state: IssueState.OPEN,
    });

    expect(issuesService.listForProjectScope).toHaveBeenCalledWith('project-1', 'user-1', {
      category: IssueCategory.TECHNICAL,
      pagination: { limit: 20, offset: 0 },
      severity: Severity.HIGH,
      siteId: 'site-1',
      state: IssueState.OPEN,
    });
  });
});
