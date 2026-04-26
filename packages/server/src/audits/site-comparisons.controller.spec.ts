import { Test } from '@nestjs/testing';

import { AuditsService } from './audits.service';
import { ProjectComparisonsController } from './site-comparisons.controller';

describe('ProjectComparisonsController', () => {
  let controller: ProjectComparisonsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      listProjectComparisons: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectComparisonsController],
      providers: [{ provide: AuditsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProjectComparisonsController);
  });

  it('list delegates with resolved pagination (defaults limit=50)', () => {
    void controller.list({ sub: 'u-1' }, 's1', {} as never);
    expect(service.listProjectComparisons).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it('list passes through explicit limit/offset', () => {
    void controller.list({ sub: 'u-1' }, 's1', { limit: 10, offset: 5 } as never);
    expect(service.listProjectComparisons).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });
});
