import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from '../projects/projects.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { WebhooksService } from './webhooks.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
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
  };
}

describe('webhooksService', () => {
  let service: WebhooksService;
  let db: DbMock;
  let projects: { assertOwner: jest.Mock; assertPermission: jest.Mock };
  let systemLogs: { warn: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    projects = {
      assertOwner: jest.fn().mockResolvedValue({}),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };
    systemLogs = { warn: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) => (key === 'WEBHOOK_MAX_SKEW_SECONDS' ? 300 : undefined)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: ProjectsService, useValue: projects },
        { provide: SystemLogsService, useValue: systemLogs },
      ],
    }).compile();
    service = moduleRef.get(WebhooksService);
  });

  describe('createEndpoint', () => {
    it('asserts owner, generates an endpointKey + secret, persists endpoint + secret', async () => {
      db.returning.mockResolvedValueOnce([{ id: 'e1', projectId: 'p1', endpointKey: 'k1' }]);

      const out = await service.createEndpoint('p1', 'u-owner', {
        name: '  Hook  ',
        enabled: false,
      });

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u-owner', expect.any(String));
      expect(db.insert).toHaveBeenCalledTimes(2); // endpoints + secrets
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          name: 'Hook',
          endpointPath: expect.stringContaining('/api/v1/webhooks/incoming/'),
        }),
      );
      expect(out.secret).toBeTruthy();
      expect(typeof out.secret).toBe('string');
    });
  });

  describe('listProjectEndpoints', () => {
    it('returns endpoints annotated with active secret metadata', async () => {
      const rotatedAt = new Date('2026-05-08T10:00:00.000Z');
      db.where
        .mockReturnValueOnce(
          thenable([
            { id: 'e1', projectId: 'p1', name: 'Active' },
            { id: 'e2', projectId: 'p1', name: 'No active secret' },
          ]),
        )
        .mockReturnValueOnce(
          thenable([
            { webhookEndpointId: 'e1', active: true, rotatedAt },
            { webhookEndpointId: 'e2', active: false, rotatedAt: new Date() },
          ]),
        );

      await expect(service.listProjectEndpoints('p1', 'u-reader')).resolves.toStrictEqual([
        expect.objectContaining({ id: 'e1', hasActiveSecret: true, rotatedAt }),
        expect.objectContaining({ id: 'e2', hasActiveSecret: false, rotatedAt: null }),
      ]);
    });

    it('does not query secrets when the project has no endpoints', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(service.listProjectEndpoints('p1', 'u-reader')).resolves.toStrictEqual([]);

      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateEndpoint', () => {
    it('checks ownership scope, trims names and returns the updated endpoint', async () => {
      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([{ id: 'e1', name: 'Fresh', enabled: false }]));

      await expect(
        service.updateEndpoint('p1', 'e1', 'u-owner', {
          name: ' Fresh ',
          enabled: false,
        }),
      ).resolves.toStrictEqual({ id: 'e1', name: 'Fresh', enabled: false });
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Fresh', enabled: false, updatedAt: expect.any(Date) }),
      );
    });

    it('rejects updates for endpoints outside the project', async () => {
      db.where.mockReturnValueOnce(thenable([]));

      await expect(
        service.updateEndpoint('p1', 'foreign', 'u-owner', { enabled: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rotateEndpointSecret', () => {
    it('disables the existing secret(s), creates a fresh one, returns it', async () => {
      // getEndpointForProject lookup
      db.where.mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }]));
      // update().set().where() resolves
      db.where.mockReturnValueOnce(undefined as unknown as never);

      const out = await service.rotateEndpointSecret('p1', 'e1', 'u-owner');

      expect(db.update).toHaveBeenCalledTimes(1); // disable old
      expect(db.insert).toHaveBeenCalledTimes(1); // insert new
      expect(out.secret).toBeTruthy();
    });
  });

  describe('verifyAndResolveProject — guards', () => {
    it('rejects when timestamp / signature headers are missing', async () => {
      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's',
          timestampHeader: undefined,
          signatureHeader: 'sig',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-numeric timestamp', async () => {
      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's',
          timestampHeader: 'not-a-number',
          signatureHeader: 'sig',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a timestamp outside the allowed skew window', async () => {
      const wayInThePast = String(Math.floor(Date.now() / 1000) - 10_000);

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's',
          timestampHeader: wayInThePast,
          signatureHeader: 'sig',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when no endpoint matches the key', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      db.where.mockReturnValueOnce(thenable([])); // endpoint lookup empty

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'unknown',
          siteId: 's',
          timestampHeader: ts,
          signatureHeader: 'sig',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the signature does not match the HMAC of timestamp.payload', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const secret = 'shared';
      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }])) // endpoint
        .mockReturnValueOnce(thenable([{ secretHash: secret }])); // active secret

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's1',
          timestampHeader: ts,
          signatureHeader: 'wrong-signature',
          payload: { event: 'x' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when no active secret exists for the endpoint', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([]));

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's1',
          timestampHeader: ts,
          signatureHeader: 'sig',
          payload: { event: 'x' },
        }),
      ).rejects.toThrow('No webhook secret configured for endpoint');
    });

    it('rejects a same-length but tampered signature', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const payload = { event: 'x' };
      const signature = createHmac('sha256', 'other-secret')
        .update(`${ts}.${JSON.stringify(payload)}`)
        .digest('hex');
      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([{ secretHash: 'shared' }]));

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's1',
          timestampHeader: ts,
          signatureHeader: signature,
          payload,
        }),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('throws BadRequestException when site is not in the resolved project', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const secret = 'shared';
      const payload = { event: 'x' };
      const sig = createHmac('sha256', secret)
        .update(`${ts}.${JSON.stringify(payload)}`)
        .digest('hex');

      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1' }]))
        .mockReturnValueOnce(thenable([{ secretHash: secret }]))
        .mockReturnValueOnce(thenable([])); // site lookup empty

      await expect(
        service.verifyAndResolveProject({
          endpointKey: 'k',
          siteId: 's-foreign',
          timestampHeader: ts,
          signatureHeader: sig,
          payload,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns { site, endpoint } on a valid signature + matching site', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const secret = 'shared';
      const payload = { event: 'x' };
      const sig = createHmac('sha256', secret)
        .update(`${ts}.${JSON.stringify(payload)}`)
        .digest('hex');

      db.where
        .mockReturnValueOnce(thenable([{ id: 'e1', projectId: 'p1', endpointKey: 'k' }]))
        .mockReturnValueOnce(thenable([{ secretHash: secret }]))
        .mockReturnValueOnce(thenable([{ id: 's1', projectId: 'p1' }]));

      const out = await service.verifyAndResolveProject({
        endpointKey: 'k',
        siteId: 's1',
        timestampHeader: ts,
        signatureHeader: sig,
        payload,
      });

      expect(out.site.id).toBe('s1');
      expect(out.endpoint.id).toBe('e1');
    });
  });
});
