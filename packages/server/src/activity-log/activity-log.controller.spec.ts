import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Permission } from '@seotracker/shared-types';

import { ProjectsService } from '../projects/projects.service';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';

const USER = { sub: 'u-1' };

describe('ActivityLogController', () => {
  let controller: ActivityLogController;
  let activity: { listForProject: jest.Mock };
  let projects: { assertPermission: jest.Mock };

  beforeEach(async () => {
    activity = { listForProject: jest.fn().mockResolvedValue([]) };
    projects = { assertPermission: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ActivityLogController],
      providers: [
        { provide: ActivityLogService, useValue: activity },
        { provide: ProjectsService, useValue: projects },
      ],
    }).compile();
    controller = moduleRef.get(ActivityLogController);
  });

  it('asserts MEMBERS_READ permission before listing', async () => {
    await controller.list(USER, 'p1');
    expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u-1', Permission.MEMBERS_READ);
  });

  it('parses limit and forwards as resolved pagination', async () => {
    await controller.list(USER, 'p1', '25');
    expect(activity.listForProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ pagination: expect.objectContaining({ limit: 25 }) }),
    );
  });

  it('parses ISO date in `before` and forwards it', async () => {
    await controller.list(USER, 'p1', undefined, '2026-01-15T00:00:00Z');
    const call = activity.listForProject.mock.calls.at(-1)?.[1] as {
      before?: Date;
    };
    expect(call?.before).toBeInstanceOf(Date);
    expect(call?.before?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('drops invalid `before` strings silently', async () => {
    await controller.list(USER, 'p1', undefined, 'not-a-date');
    const call = activity.listForProject.mock.calls.at(-1)?.[1] as {
      before?: Date;
    };
    expect(call?.before).toBeUndefined();
  });
});
