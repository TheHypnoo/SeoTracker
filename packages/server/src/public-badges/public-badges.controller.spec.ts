import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { HEADERS_METADATA } from '@nestjs/common/constants';

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

  it('allows the public SVG to be embedded across origins', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, PublicBadgesController.prototype.svg);

    expect(headers).toContainEqual({
      name: 'Cross-Origin-Resource-Policy',
      value: 'cross-origin',
    });
  });

  it('uses a route-level default throttle instead of a global badge bucket', () => {
    const handler = PublicBadgesController.prototype.svg;

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    expect(Reflect.getMetadata('THROTTLER:LIMITbadge', handler)).toBeUndefined();
    expect(Reflect.getMetadata('THROTTLER:TTLbadge', handler)).toBeUndefined();
  });

  it('propagates errors from the service (e.g. redis down)', async () => {
    service.renderSvg.mockRejectedValueOnce(new Error('redis down'));
    await expect(controller.svg('s1')).rejects.toThrow('redis down');
  });
});
