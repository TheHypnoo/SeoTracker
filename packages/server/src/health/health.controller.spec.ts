import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../database/database.constants';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { HealthController, withTimeout } from './health.controller';

describe('healthController', () => {
  let controller: HealthController;
  let db: { execute: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    db = { execute: jest.fn() };
    redis = { ping: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: REDIS_CONNECTION, useValue: redis },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('withTimeout rejects when a dependency hangs', async () => {
    jest.useFakeTimers();
    const promise = withTimeout(new Promise<never>(() => {}), 'database').catch(
      (error: unknown) => error,
    );

    await jest.advanceTimersByTimeAsync(3000);
    jest.useRealTimers();
    await expect(promise).resolves.toMatchObject({ message: 'database timed out after 3000ms' });
  });

  it('liveness returns ok + ISO timestamp', () => {
    const out = controller.liveness();
    expect(out.status).toBe('ok');
    expect(typeof out.timestamp).toBe('string');
  });

  it('readiness returns ready when both DB and Redis respond', async () => {
    db.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    redis.ping.mockResolvedValueOnce('PONG');

    const out = await controller.readiness();

    expect(out.status).toBe('ready');
    expect(out.checks).toStrictEqual({ database: 'ok', redis: 'ok' });
  });

  it('readiness reports non-error dependency failures as unknown errors', async () => {
    db.execute.mockRejectedValueOnce('db string failure');
    redis.ping.mockRejectedValueOnce('redis string failure');

    await expect(controller.readiness()).rejects.toMatchObject({
      response: expect.objectContaining({
        failures: { database: 'unknown error', redis: 'unknown error' },
      }),
    });
  });

  it('readiness throws ServiceUnavailableException when DB is down', async () => {
    db.execute.mockRejectedValueOnce(new Error('connection refused'));
    redis.ping.mockResolvedValueOnce('PONG');

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('readiness throws ServiceUnavailableException when Redis is down', async () => {
    db.execute.mockResolvedValueOnce([]);
    redis.ping.mockRejectedValueOnce(new Error('redis down'));

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
