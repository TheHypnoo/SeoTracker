import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { AuditsService } from '../audits/audits.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

const USER = { sub: 'u-1' };

describe('webhooksController', () => {
  let controller: WebhooksController;
  let webhooks: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;

  beforeEach(async () => {
    webhooks = {
      listProjectEndpoints: jest.fn().mockResolvedValue([]),
      createEndpoint: jest.fn().mockResolvedValue('created'),
      updateEndpoint: jest.fn().mockResolvedValue('updated'),
      rotateEndpointSecret: jest.fn().mockResolvedValue('rotated'),
      verifyAndResolveProject: jest.fn().mockResolvedValue({ site: { id: 's1' } }),
    };
    audits = {
      runWebhook: jest.fn().mockResolvedValue('queued'),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: webhooks },
        { provide: AuditsService, useValue: audits },
      ],
    }).compile();
    controller = moduleRef.get(WebhooksController);
  });

  it('list / create / update / rotateSecret delegate', () => {
    void controller.list(USER, 'p1');
    void controller.create(USER, 'p1', { url: 'https://x' } as never);
    void controller.update(USER, 'p1', 'e1', { active: false } as never);
    void controller.rotateSecret(USER, 'p1', 'e1');
    expect(webhooks.listProjectEndpoints).toHaveBeenCalledWith('p1', 'u-1');
    expect(webhooks.createEndpoint).toHaveBeenCalledWith('p1', 'u-1', { url: 'https://x' });
    expect(webhooks.updateEndpoint).toHaveBeenCalledWith('p1', 'e1', 'u-1', { active: false });
    expect(webhooks.rotateEndpointSecret).toHaveBeenCalledWith('p1', 'e1', 'u-1');
  });

  it('triggerAudit verifies and runs audit on resolved siteId', async () => {
    const result = await controller.triggerAudit(
      'key-1',
      { siteId: 's1' } as never,
      'ts-1',
      'sig-1',
    );

    expect(webhooks.verifyAndResolveProject).toHaveBeenCalledWith({
      endpointKey: 'key-1',
      siteId: 's1',
      timestampHeader: 'ts-1',
      signatureHeader: 'sig-1',
      payload: { siteId: 's1' },
    });
    expect(audits.runWebhook).toHaveBeenCalledWith('s1');
    expect(result).toBe('queued');
  });
});
