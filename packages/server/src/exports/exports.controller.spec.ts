import { Test } from '@nestjs/testing';

import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

const USER = { sub: 'u-1' };

describe('ExportsController', () => {
  let controller: ExportsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue('queued'),
      listForProject: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue('one'),
      resolveDownload: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ExportsController],
      providers: [{ provide: ExportsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ExportsController);
  });

  it('create delegates to service.create', () => {
    void controller.create(USER, 's1', { kind: 'AUDIT_RESULT' } as never);
    expect(service.create).toHaveBeenCalledWith('s1', 'u-1', { kind: 'AUDIT_RESULT' });
  });

  it('list applies pagination defaults', () => {
    void controller.list(USER, 's1', {} as never);
    expect(service.listForProject).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it('list passes through explicit pagination', () => {
    void controller.list(USER, 's1', { limit: 5, offset: 10 } as never);
    expect(service.listForProject).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 5, offset: 10 }),
    );
  });

  it('getById delegates', () => {
    void controller.getById(USER, 'e1');
    expect(service.getById).toHaveBeenCalledWith('e1', 'u-1');
  });
});
