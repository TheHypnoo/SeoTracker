import { Test } from '@nestjs/testing';

import { AlertsService } from './alerts.service';
import { ProjectAlertsController } from './site-alerts.controller';

const USER = { sub: 'u-1' };

describe('ProjectAlertsController', () => {
  let controller: ProjectAlertsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getForProject: jest.fn().mockResolvedValue('rule'),
      updateForProject: jest.fn().mockResolvedValue('updated'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectAlertsController],
      providers: [{ provide: AlertsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProjectAlertsController);
  });

  it('getRule delegates to alertsService.getForProject', () => {
    void controller.getRule(USER, 's1');
    expect(service.getForProject).toHaveBeenCalledWith('s1', 'u-1');
  });

  it('updateRule delegates to alertsService.updateForProject with body', () => {
    void controller.updateRule(USER, 's1', { scoreDropPct: 10 } as never);
    expect(service.updateForProject).toHaveBeenCalledWith('s1', 'u-1', { scoreDropPct: 10 });
  });
});
