import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboundDeliveryStatus, OutboundEvent, Permission } from '@seotracker/shared-types';
import { createHmac } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from '../projects/projects.service';
import { QueueService } from '../queue/queue.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { OutboundWebhooksService } from './outbound-webhooks.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockResolvedValue(rows),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };
}

describe('outboundWebhooksService', () => {
  let service: OutboundWebhooksService;
  let db: DbMock;
  let projects: { assertOwner: jest.Mock; assertPermission: jest.Mock };
  let queue: { enqueueOutboundDelivery: jest.Mock };
  let systemLogs: { warn: jest.Mock; error: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    db = makeDb();
    projects = {
      assertOwner: jest.fn().mockResolvedValue({}),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };
    queue = { enqueueOutboundDelivery: jest.fn().mockResolvedValue(undefined) };
    systemLogs = { warn: jest.fn().mockResolvedValue(undefined), error: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundWebhooksService,
        { provide: DRIZZLE, useValue: db },
        { provide: ProjectsService, useValue: projects },
        { provide: QueueService, useValue: queue },
        { provide: SystemLogsService, useValue: systemLogs },
      ],
    }).compile();
    service = moduleRef.get(OutboundWebhooksService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('list', () => {
    it('checks read permission and returns project webhooks ordered newest first', async () => {
      const rows = [{ id: 'w1' }, { id: 'w2' }];
      db.where.mockReturnValueOnce(thenable(rows));

      await expect(service.list('p1', 'u-reader')).resolves.toStrictEqual(rows);

      expect(projects.assertPermission).toHaveBeenCalledWith(
        'p1',
        'u-reader',
        Permission.OUTBOUND_READ,
      );
    });
  });

  describe('create', () => {
    it('asserts owner, generates a 32-byte hex secret, persists the webhook', async () => {
      db.returning.mockResolvedValueOnce([
        { id: 'w1', projectId: 'p1', secret: 'abc', enabled: true },
      ]);

      await service.create('p1', 'u-owner', {
        name: '  Hook  ',
        url: ' https://x.test/in ',
        events: [OutboundEvent.AUDIT_COMPLETED],
      });

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u-owner', expect.any(String));
      const values = db.values.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(values).toMatchObject({
        projectId: 'p1',
        name: 'Hook',
        url: 'https://x.test/in',
        enabled: true,
      });
      expect(typeof values.secret).toBe('string');
      expect((values.secret as string).length).toBeGreaterThanOrEqual(32);
    });

    it('coerces empty/undefined header fields to null', async () => {
      db.returning.mockResolvedValueOnce([{ id: 'w1' }]);

      await service.create('p1', 'u-owner', {
        name: 'X',
        url: 'https://x.test',
        events: [OutboundEvent.AUDIT_COMPLETED],
        headerName: '   ',
        headerValue: undefined,
      });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ headerName: null, headerValue: null }),
      );
    });
  });

  describe('rotateSecret', () => {
    it('asserts owner, fetches the webhook, sets a new secret', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }]))
        .mockReturnValueOnce(db as unknown as never);
      db.returning.mockResolvedValueOnce([{ id: 'w1', secret: 'fresh' }]);

      await service.rotateSecret('p1', 'w1', 'u-owner');

      expect(projects.assertPermission).toHaveBeenCalledWith(
        'p1',
        'u-owner',
        Permission.OUTBOUND_WRITE,
      );
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ secret: expect.any(String), updatedAt: expect.any(Date) }),
      );
    });

    it('throws NotFoundException when the webhook is not in this project', async () => {
      db.where.mockReturnValueOnce(thenable([])); // not found

      await expect(service.rotateSecret('p1', 'w-foreign', 'u-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('checks write permission, trims optional fields and preserves omitted fields', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([{ id: 'w1', name: 'Fresh' }]));

      await expect(
        service.update('p1', 'w1', 'u-owner', {
          name: '  Fresh  ',
          headerName: '   ',
          headerValue: '  token  ',
          enabled: false,
        }),
      ).resolves.toStrictEqual({ id: 'w1', name: 'Fresh' });

      expect(projects.assertPermission).toHaveBeenCalledWith(
        'p1',
        'u-owner',
        Permission.OUTBOUND_WRITE,
      );
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fresh',
          headerName: null,
          headerValue: 'token',
          enabled: false,
          updatedAt: expect.any(Date),
        }),
      );
      expect(db.set).toHaveBeenCalledWith(
        expect.not.objectContaining({
          url: expect.anything(),
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes a webhook only after project-scoped lookup succeeds', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }]))
        .mockResolvedValueOnce([]);

      await expect(service.remove('p1', 'w1', 'u-owner')).resolves.toStrictEqual({ ok: true });

      expect(projects.assertPermission).toHaveBeenCalledWith(
        'p1',
        'u-owner',
        Permission.OUTBOUND_WRITE,
      );
      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('revealSecret', () => {
    it('returns just the secret string for the matching webhook', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 'w1', secret: 's1' }]));

      const out = await service.revealSecret('p1', 'w1', 'u-owner');
      expect(out).toStrictEqual({ secret: 's1' });
    });
  });

  describe('listDeliveries', () => {
    it('caps the limit at 100 even when caller asks for more', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }])) // getWebhookForProject
        .mockReturnValueOnce(db as unknown as never); // deliveries chain

      // The deliveries query terminates at .limit(N) — we capture the arg.
      const limitSpy = jest.fn().mockResolvedValue([]);
      db.orderBy.mockReturnValue({ limit: limitSpy });

      await service.listDeliveries('p1', 'w1', 'u-owner', { limit: 999 });

      expect(limitSpy).toHaveBeenCalledWith(100);
    });
  });

  describe('sendTestDelivery', () => {
    it('inserts a PENDING delivery row + enqueues the job', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }]));
      db.returning.mockResolvedValueOnce([{ id: 'd1', status: OutboundDeliveryStatus.PENDING }]);

      const out = await service.sendTestDelivery('p1', 'w1', 'u-owner');

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          outboundWebhookId: 'w1',
          event: 'test.ping',
          status: OutboundDeliveryStatus.PENDING,
        }),
      );
      expect(queue.enqueueOutboundDelivery).toHaveBeenCalledWith({ deliveryId: 'd1' });
      expect(out.id).toBe('d1');
    });
  });

  describe('dispatch', () => {
    it('returns dispatched=0 when no enabled subscriber matches the event', async () => {
      db.where.mockReturnValueOnce(thenable([])); // empty subscribers

      const out = await service.dispatch({
        projectId: 'p1',
        event: OutboundEvent.AUDIT_COMPLETED,
        payload: {},
      });

      expect(out).toStrictEqual({ dispatched: 0 });
      expect(queue.enqueueOutboundDelivery).not.toHaveBeenCalled();
    });

    it('inserts one delivery per matching subscriber and enqueues each', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          { id: 'w1', secret: 's1' },
          { id: 'w2', secret: 's2' },
        ]),
      );
      db.returning.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }]);

      const out = await service.dispatch({
        projectId: 'p1',
        event: OutboundEvent.AUDIT_COMPLETED,
        payload: { score: 90 },
      });

      expect(out.dispatched).toBe(2);
      expect(queue.enqueueOutboundDelivery).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifySignature (static)', () => {
    it('accepts a correctly-signed payload', () => {
      const secret = 'shared-secret';
      const timestamp = '1700000000';
      const body = '{"event":"x"}';
      const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

      const ok = OutboundWebhooksService.verifySignature({
        secret,
        timestamp,
        body,
        signature,
      });

      expect(ok).toBe(true);
    });

    it('rejects a wrong-length signature without timing leak', () => {
      const ok = OutboundWebhooksService.verifySignature({
        secret: 'x',
        timestamp: '1',
        body: 'b',
        signature: 'short',
      });
      expect(ok).toBe(false);
    });

    it('rejects a tampered signature with same length', () => {
      const secret = 'shared-secret';
      const sig = createHmac('sha256', secret).update('1.b').digest('hex');
      // Mutate one char
      const tampered = sig[0] === '0' ? `1${sig.slice(1)}` : `0${sig.slice(1)}`;

      const ok = OutboundWebhooksService.verifySignature({
        secret,
        timestamp: '1',
        body: 'b',
        signature: tampered,
      });
      expect(ok).toBe(false);
    });
  });

  describe('processDelivery', () => {
    it('warns and exits when the delivery id is unknown', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await service.processDelivery('missing');

      expect(systemLogs.warn).toHaveBeenCalledWith(
        OutboundWebhooksService.name,
        'Outbound delivery not found',
        { deliveryId: 'missing' },
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it('skips deliveries that already succeeded', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            id: 'd1',
            status: OutboundDeliveryStatus.SUCCESS,
          },
        ]),
      );

      await service.processDelivery('d1');

      expect(global.fetch).toBe(originalFetch);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('marks the delivery failed when the webhook is missing or disabled', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              id: 'd-missing-hook',
              outboundWebhookId: 'w-missing',
              status: OutboundDeliveryStatus.PENDING,
              attemptCount: null,
            },
          ]),
        )
        .mockReturnValueOnce(thenable([]))
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(
          thenable([
            {
              id: 'd-disabled',
              outboundWebhookId: 'w-disabled',
              status: OutboundDeliveryStatus.PENDING,
              attemptCount: 2,
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ id: 'w-disabled', enabled: false }]))
        .mockResolvedValueOnce(undefined);

      await service.processDelivery('d-missing-hook');
      await service.processDelivery('d-disabled');

      expect(db.set.mock.calls).toContainEqual([
        expect.objectContaining({
          status: OutboundDeliveryStatus.FAILED,
          errorMessage: 'Webhook not found',
          attemptCount: 1,
        }),
      ]);
      expect(db.set.mock.calls).toContainEqual([
        expect.objectContaining({
          status: OutboundDeliveryStatus.FAILED,
          errorMessage: 'Webhook disabled',
          attemptCount: 3,
        }),
      ]);
    });

    it('posts the exact signed body, custom header and persists success metadata', async () => {
      const createdAt = new Date('2026-05-08T10:00:00.000Z');
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: jest.fn().mockResolvedValue('accepted'),
      });
      global.fetch = fetchMock as never;
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              id: 'd1',
              outboundWebhookId: 'w1',
              event: OutboundEvent.AUDIT_COMPLETED,
              payload: { score: 90 },
              status: OutboundDeliveryStatus.PENDING,
              attemptCount: 0,
              createdAt,
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              id: 'w1',
              enabled: true,
              secret: 'shared-secret',
              url: 'https://receiver.test/hooks',
              headerName: 'x-api-key',
              headerValue: 'receiver-secret',
            },
          ]),
        );

      await service.processDelivery('d1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://receiver.test/hooks');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      const body = init.body as string;
      expect(JSON.parse(body)).toStrictEqual({
        event: OutboundEvent.AUDIT_COMPLETED,
        deliveryId: 'd1',
        createdAt: createdAt.toISOString(),
        payload: { score: 90 },
      });
      expect(headers['x-api-key']).toBe('receiver-secret');
      expect(headers['x-seotracker-event']).toBe(OutboundEvent.AUDIT_COMPLETED);
      expect(headers['x-seotracker-delivery-id']).toBe('d1');
      expect(
        OutboundWebhooksService.verifySignature({
          secret: 'shared-secret',
          timestamp: headers['x-seotracker-timestamp'] ?? '',
          body,
          signature: headers['x-seotracker-signature'] ?? '',
        }),
      ).toBe(true);
      expect(db.set).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: OutboundDeliveryStatus.SUCCESS,
          attemptCount: 1,
          statusCode: 202,
          responseBody: 'accepted',
          errorMessage: null,
          deliveredAt: expect.any(Date),
        }),
      );
    });

    it('persists HTTP failures before the BullMQ retry error is rethrown', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('receiver exploded'),
      });
      global.fetch = fetchMock as never;
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              id: 'd1',
              outboundWebhookId: 'w1',
              event: OutboundEvent.AUDIT_FAILED,
              payload: { reason: 'boom' },
              status: OutboundDeliveryStatus.PENDING,
              attemptCount: 0,
              createdAt: new Date('2026-05-08T10:00:00.000Z'),
            },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            {
              id: 'w1',
              enabled: true,
              secret: 'shared-secret',
              url: 'https://receiver.test/hooks',
              headerName: null,
              headerValue: null,
            },
          ]),
        );

      await expect(service.processDelivery('d1')).rejects.toThrow(
        'Outbound webhook w1 returned 500',
      );

      expect(db.set.mock.calls).toContainEqual([
        expect.objectContaining({
          status: OutboundDeliveryStatus.FAILED,
          attemptCount: 1,
          statusCode: 500,
          responseBody: 'receiver exploded',
          errorMessage: 'HTTP 500',
        }),
      ]);
    });
  });

  describe('reconcilePendingDeliveries', () => {
    it('re-enqueues stale pending deliveries and logs per-delivery failures', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          { id: 'd1', outboundWebhookId: 'w1' },
          { id: 'd2', outboundWebhookId: 'w2' },
        ]),
      );
      queue.enqueueOutboundDelivery
        .mockRejectedValueOnce(new Error('redis busy'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.reconcilePendingDeliveries({ limit: 2, staleAfterMs: 1_000 }),
      ).resolves.toStrictEqual({
        checked: 2,
        requeued: 1,
      });

      expect(queue.enqueueOutboundDelivery).toHaveBeenCalledWith(
        { deliveryId: 'd1' },
        expect.objectContaining({ jobId: expect.stringContaining('d1:reconcile:') }),
      );
      expect(systemLogs.error).toHaveBeenCalledWith(
        OutboundWebhooksService.name,
        'Pending outbound delivery could not be reconciled',
        expect.any(Error),
        { deliveryId: 'd1', outboundWebhookId: 'w1' },
      );
    });
  });
});
