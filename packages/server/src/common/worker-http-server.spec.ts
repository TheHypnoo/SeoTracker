import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AddressInfo } from 'node:net';

import { DRIZZLE } from '../database/database.constants';
import { MetricsService } from '../metrics/metrics.service';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { startWorkerHttpServer } from './worker-http-server';

function request(port: number, path: string, method = 'GET') {
  return fetch(`http://127.0.0.1:${port}${path}`, { method });
}

function toPlainJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toPlainJson(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlainJson(item)]));
  }
  return value;
}

async function readPlainJson(port: number, path: string) {
  const value = await request(port, path).then((res) => res.json());
  return toPlainJson(value);
}

describe('startWorkerHttpServer', () => {
  const db = { execute: jest.fn() };
  const redis = { ping: jest.fn() };
  const metricsService = {
    contentType: jest.fn().mockReturnValue('text/plain; version=0.0.4'),
    metrics: jest.fn().mockResolvedValue('metric_name 1\n'),
  };
  const app = {
    get: jest.fn((token: unknown) => {
      if (token === MetricsService) return metricsService;
      if (token === DRIZZLE) return db;
      if (token === REDIS_CONNECTION) return redis;
      throw new Error('unknown provider');
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.execute.mockResolvedValue([{ ok: 1 }]);
    redis.ping.mockResolvedValue('PONG');
    metricsService.metrics.mockResolvedValue('metric_name 1\n');
  });

  it('serves liveness, readiness, metrics and fallback HTTP responses', async () => {
    const server = await startWorkerHttpServer(app as never, { port: 0, serviceName: 'jobs' });
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(readPlainJson(port, '/health/liveness')).resolves.toStrictEqual({
        service: 'jobs',
        status: 'ok',
      });

      await expect(readPlainJson(port, '/health/readiness')).resolves.toStrictEqual({
        checks: { database: 'ok', redis: 'ok' },
        service: 'jobs',
        status: 'ready',
      });

      const metricsResponse = await request(port, '/metrics');
      await expect(metricsResponse.text()).resolves.toBe('metric_name 1\n');
      expect(metricsResponse.headers.get('content-type')).toContain('text/plain');

      await expect(request(port, '/missing').then((res) => res.status)).resolves.toBe(404);
      await expect(
        request(port, '/health/liveness', 'POST').then((res) => res.status),
      ).resolves.toBe(405);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('returns unavailable readiness when a dependency fails and 500 when metrics fail', async () => {
    db.execute.mockRejectedValueOnce(new Error('db down'));
    metricsService.metrics.mockRejectedValueOnce(new Error('metrics down'));
    const server = await startWorkerHttpServer(app as never, { port: 0, serviceName: 'scheduler' });
    const port = (server.address() as AddressInfo).port;

    try {
      const readinessResponse = await request(port, '/health/readiness');
      const readinessBody = toPlainJson(await readinessResponse.json());
      expect(readinessBody).toStrictEqual({
        checks: { database: 'fail', redis: 'ok' },
        service: 'scheduler',
        status: 'unavailable',
      });
      expect(readinessResponse.status).toBe(503);

      await expect(request(port, '/metrics').then((res) => res.status)).resolves.toBe(500);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
