import { Test } from '@nestjs/testing';

import { PublicBadgesController } from './public-badges.controller';
import { PublicBadgesService } from './public-badges.service';

describe('PublicBadgesController', () => {
  let controller: PublicBadgesController;
  let service: { renderSvg: jest.Mock };

  beforeEach(async () => {
    service = { renderSvg: jest.fn().mockResolvedValue({ svg: '<svg/>' }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [PublicBadgesController],
      providers: [{ provide: PublicBadgesService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PublicBadgesController);
  });

  it('delegates to service.renderSvg with the path siteId', async () => {
    await controller.svg('s1');
    expect(service.renderSvg).toHaveBeenCalledWith('s1');
  });

  it('returns the svg string from the service', async () => {
    service.renderSvg.mockResolvedValueOnce({ svg: '<svg test/>' });
    const out = await controller.svg('s1');
    expect(out).toBe('<svg test/>');
  });

  it('propagates errors from the service (e.g. redis down)', async () => {
    service.renderSvg.mockRejectedValueOnce(new Error('redis down'));
    await expect(controller.svg('s1')).rejects.toThrow('redis down');
  });
});
