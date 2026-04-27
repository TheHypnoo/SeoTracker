import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboundDeliveryStatus, OutboundEvent } from '@seotracker/shared-types';
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
  };
}

describe('OutboundWebhooksService', () => {
  let service: OutboundWebhooksService;
  let db: DbMock;
  let projects: { assertOwner: jest.Mock; assertPermission: jest.Mock };
  let queue: { enqueueOutboundDelivery: jest.Mock };
  let systemLogs: { warn: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    projects = {
      assertOwner: jest.fn().mockResolvedValue({}),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };
    queue = { enqueueOutboundDelivery: jest.fn().mockResolvedValue(undefined) };
    systemLogs = { warn: jest.fn().mockResolvedValue(undefined) };

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

      expect(projects.assertPermission).toHaveBeenCalled();
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

  describe('revealSecret', () => {
    it('returns just the secret string for the matching webhook', async () => {
      db.where.mockReturnValueOnce(thenable([{ id: 'w1', secret: 's1' }]));

      const out = await service.revealSecret('p1', 'w1', 'u-owner');
      expect(out).toEqual({ secret: 's1' });
    });
  });

  describe('listDeliveries', () => {
    it('caps the limit at 100 even when caller asks for more', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'w1', projectId: 'p1' }])) // getWebhookForProject
        .mockReturnValueOnce(db as unknown as never); // deliveries chain

      // The deliveries query terminates at .limit(N) — we capture the arg.
      const limitSpy = jest.fn().mockResolvedValue([]);
      (db as DbMock & { orderBy?: jest.Mock }).orderBy = jest
        .fn()
        .mockReturnValue({ limit: limitSpy });

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

      expect(out).toEqual({ dispatched: 0 });
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
});
