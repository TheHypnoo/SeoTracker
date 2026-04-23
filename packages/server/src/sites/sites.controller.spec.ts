import { Test } from '@nestjs/testing';

import { CrawlConfigService } from './crawl-config.service';
import { PublicBadgeAdminService } from './public-badge-admin.service';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

const USER = { sub: 'u-1' };

describe('SitesController', () => {
  let controller: SitesController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue('created'),
      listForProject: jest.fn().mockResolvedValue('forProject'),
      listByUser: jest.fn().mockResolvedValue('forUser'),
      getById: jest.fn().mockResolvedValue('one'),
      update: jest.fn().mockResolvedValue('updated'),
      delete: jest.fn().mockResolvedValue('deleted'),
      upsertSchedule: jest.fn().mockResolvedValue('scheduled'),
      getSchedule: jest.fn().mockResolvedValue('schedule'),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SitesController],
      providers: [
        { provide: SitesService, useValue: service },
        {
          provide: CrawlConfigService,
          useValue: { getForUser: jest.fn(), update: jest.fn() },
        },
        {
          provide: PublicBadgeAdminService,
          useValue: { getForUser: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();
    controller = moduleRef.get(SitesController);
  });

  it('create delegates to sitesService.create', () => {
    void controller.create(USER, { projectId: 'p1', name: 'n', domain: 'x.test' } as never);
    expect(service.create).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ projectId: 'p1' }),
    );
  });

  it('list with projectId filter delegates to listForProject', () => {
    void controller.list(USER, { projectId: 'p1', limit: 10, offset: 0 } as never);
    expect(service.listForProject).toHaveBeenCalledWith(
      'p1',
      'u-1',
      expect.objectContaining({ pagination: { limit: 10, offset: 0 } }),
    );
  });

  it('list without projectId delegates to listByUser', () => {
    void controller.list(USER, {} as never);
    expect(service.listByUser).toHaveBeenCalledWith('u-1');
  });

  it('getById/update/remove delegate', () => {
    void controller.getById(USER, 's1');
    void controller.update(USER, 's1', { name: 'New' } as never);
    void controller.remove(USER, 's1');
    expect(service.getById).toHaveBeenCalledWith('s1', 'u-1');
    expect(service.update).toHaveBeenCalledWith('s1', 'u-1', { name: 'New' });
    expect(service.delete).toHaveBeenCalledWith('s1', 'u-1');
  });

  it('upsertSchedule / getSchedule delegate', () => {
    void controller.upsertSchedule(USER, 's1', { frequency: 'DAILY' } as never);
    void controller.getSchedule(USER, 's1');
    expect(service.upsertSchedule).toHaveBeenCalledWith('s1', 'u-1', { frequency: 'DAILY' });
    expect(service.getSchedule).toHaveBeenCalledWith('s1', 'u-1');
  });
});
