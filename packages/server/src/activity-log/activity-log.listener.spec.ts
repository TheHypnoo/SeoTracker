import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActivityAction, Role } from '@seotracker/shared-types';

import { ActivityLogService } from './activity-log.service';
import { ActivityLogListener } from './activity-log.listener';

describe('activityLogListener', () => {
  let service: { record: jest.Mock; snapshotRole: jest.Mock };
  let listener: ActivityLogListener;

  beforeEach(() => {
    service = {
      record: jest.fn().mockResolvedValue(undefined),
      snapshotRole: jest.fn().mockResolvedValue(Role.MEMBER),
    };
    listener = new ActivityLogListener(service as unknown as ActivityLogService);
  });

  it('uses the explicit role when provided (does not snapshot)', async () => {
    await listener.handle({
      projectId: 'p1',
      userId: 'u1',
      role: Role.OWNER,
      action: ActivityAction.PROJECT_CREATED,
    });

    expect(service.snapshotRole).not.toHaveBeenCalled();
    expect(service.record).toHaveBeenCalledWith(expect.objectContaining({ role: Role.OWNER }));
  });

  it('looks up the role when the event omits it', async () => {
    await listener.handle({
      projectId: 'p1',
      userId: 'u1',
      action: ActivityAction.SITE_CREATED,
    });

    expect(service.snapshotRole).toHaveBeenCalledWith('p1', 'u1');
    expect(service.record).toHaveBeenCalledWith(expect.objectContaining({ role: Role.MEMBER }));
  });

  it('preserves explicit null role (former member) without snapshot', async () => {
    await listener.handle({
      projectId: 'p1',
      userId: null,
      role: null,
      action: ActivityAction.MEMBER_REMOVED,
    });

    expect(service.snapshotRole).not.toHaveBeenCalled();
    expect(service.record).toHaveBeenCalledWith(expect.objectContaining({ role: null }));
  });

  it('forwards metadata + resourceType/resourceId/siteId verbatim', async () => {
    await listener.handle({
      projectId: 'p1',
      userId: 'u1',
      role: Role.MEMBER,
      action: ActivityAction.AUDIT_RUN,
      resourceType: 'audit',
      resourceId: 'a1',
      siteId: 's1',
      metadata: { trigger: 'MANUAL' },
    });

    expect(service.record).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'audit',
        resourceId: 'a1',
        siteId: 's1',
        metadata: { trigger: 'MANUAL' },
      }),
    );
  });
});
