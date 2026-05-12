import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { AuditsService } from './audits.service';
import { ProjectAuditsController } from './site-audits.controller';

const USER = { sub: 'u-1' };

describe('ProjectAuditsController', () => {
  let controller: ProjectAuditsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      runManual: jest.fn().mockResolvedValue('queued'),
      listProjectRuns: jest.fn().mockResolvedValue([]),
      compareProjectRuns: jest.fn().mockResolvedValue('cmp'),
      getProjectTrends: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectAuditsController],
      providers: [{ provide: AuditsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProjectAuditsController);
  });

  it('run delegates to runManual', () => {
    void controller.run(USER, 's1');
    expect(service.runManual).toHaveBeenCalledWith('s1', 'u-1');
  });

  it('list delegates with status/trigger/from/to + resolved pagination', () => {
    void controller.list(USER, 's1', {
      status: 'COMPLETED',
      trigger: 'MANUAL',
      from: 'a',
      to: 'b',
      limit: 5,
      offset: 10,
    } as never);
    expect(service.listProjectRuns).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({
        status: 'COMPLETED',
        trigger: 'MANUAL',
        from: 'a',
        to: 'b',
        pagination: { limit: 5, offset: 10 },
      }),
    );
  });

  it('compare delegates to compareProjectRuns', () => {
    void controller.compare(USER, 's1', 'a', 'b');
    expect(service.compareProjectRuns).toHaveBeenCalledWith('s1', 'u-1', 'a', 'b');
  });

  it('trends parses limit and clamps to 1..100', () => {
    void controller.trends(USER, 's1', '5');
    expect(service.getProjectTrends).toHaveBeenLastCalledWith('s1', 'u-1', 5);

    void controller.trends(USER, 's1', '0');
    expect(service.getProjectTrends).toHaveBeenLastCalledWith('s1', 'u-1', 1);

    void controller.trends(USER, 's1', '999');
    expect(service.getProjectTrends).toHaveBeenLastCalledWith('s1', 'u-1', 100);

    void controller.trends(USER, 's1');
    expect(service.getProjectTrends).toHaveBeenLastCalledWith('s1', 'u-1', undefined);
  });
});
