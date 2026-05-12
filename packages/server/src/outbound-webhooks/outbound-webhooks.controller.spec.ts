import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { OutboundWebhooksController } from './outbound-webhooks.controller';
import { OutboundWebhooksService } from './outbound-webhooks.service';

const USER = { sub: 'u-1' };

describe('OutboundWebhooksController', () => {
  let controller: OutboundWebhooksController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue('created'),
      update: jest.fn().mockResolvedValue('updated'),
      remove: jest.fn().mockResolvedValue('deleted'),
      rotateSecret: jest.fn().mockResolvedValue('rotated'),
      revealSecret: jest.fn().mockResolvedValue({ secret: 's' }),
      sendTestDelivery: jest.fn().mockResolvedValue('test'),
      listDeliveries: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OutboundWebhooksController],
      providers: [{ provide: OutboundWebhooksService, useValue: service }],
    }).compile();
    controller = moduleRef.get(OutboundWebhooksController);
  });

  it('list / create / update / remove delegate', () => {
    void controller.list(USER, 'p1');
    void controller.create(USER, 'p1', { url: 'https://x' } as never);
    void controller.update(USER, 'p1', 'w1', { active: false } as never);
    void controller.remove(USER, 'p1', 'w1');
    expect(service.list).toHaveBeenCalledWith('p1', 'u-1');
    expect(service.create).toHaveBeenCalledWith('p1', 'u-1', { url: 'https://x' });
    expect(service.update).toHaveBeenCalledWith('p1', 'w1', 'u-1', { active: false });
    expect(service.remove).toHaveBeenCalledWith('p1', 'w1', 'u-1');
  });

  it('rotateSecret / revealSecret / sendTest delegate', () => {
    void controller.rotateSecret(USER, 'p1', 'w1');
    void controller.revealSecret(USER, 'p1', 'w1');
    void controller.sendTest(USER, 'p1', 'w1');
    expect(service.rotateSecret).toHaveBeenCalledWith('p1', 'w1', 'u-1');
    expect(service.revealSecret).toHaveBeenCalledWith('p1', 'w1', 'u-1');
    expect(service.sendTestDelivery).toHaveBeenCalledWith('p1', 'w1', 'u-1');
  });

  it('listDeliveries parses limit and forwards { limit } when valid', () => {
    void controller.listDeliveries(USER, 'p1', 'w1', '10');
    expect(service.listDeliveries).toHaveBeenLastCalledWith('p1', 'w1', 'u-1', { limit: 10 });
  });

  it('listDeliveries leaves limit undefined when missing', () => {
    void controller.listDeliveries(USER, 'p1', 'w1');
    expect(service.listDeliveries).toHaveBeenLastCalledWith('p1', 'w1', 'u-1', {
      limit: undefined,
    });
  });
});
