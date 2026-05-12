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
    let livenessBody: unknown;
    let readinessBody: unknown;
    let metricsText = '';
    let metricsContentType: string | null = null;
    let missingStatus = 0;
    let postLivenessStatus = 0;

    try {
      livenessBody = await readPlainJson(port, '/health/liveness');
      readinessBody = await readPlainJson(port, '/health/readiness');
      const metricsResponse = await request(port, '/metrics');
      metricsText = await metricsResponse.text();
      metricsContentType = metricsResponse.headers.get('content-type');
      missingStatus = await request(port, '/missing').then((res) => res.status);
      postLivenessStatus = await request(port, '/health/liveness', 'POST').then(
        (res) => res.status,
      );
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

    expect(livenessBody).toStrictEqual({
      service: 'jobs',
      status: 'ok',
    });
    expect(readinessBody).toStrictEqual({
      checks: { database: 'ok', redis: 'ok' },
      service: 'jobs',
      status: 'ready',
    });
    expect(metricsText).toBe('metric_name 1\n');
    expect(metricsContentType).toContain('text/plain');
    expect(missingStatus).toBe(404);
    expect(postLivenessStatus).toBe(405);
  });

  it('returns unavailable readiness when a dependency fails and 500 when metrics fail', async () => {
    db.execute.mockRejectedValueOnce(new Error('db down'));
    metricsService.metrics.mockRejectedValueOnce(new Error('metrics down'));
    const server = await startWorkerHttpServer(app as never, { port: 0, serviceName: 'scheduler' });
    const port = (server.address() as AddressInfo).port;
    let readinessBody: unknown;
    let readinessStatus = 0;
    let metricsStatus = 0;

    try {
      const readinessResponse = await request(port, '/health/readiness');
      readinessBody = toPlainJson(await readinessResponse.json());
      readinessStatus = readinessResponse.status;
      metricsStatus = await request(port, '/metrics').then((res) => res.status);
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

    expect(readinessBody).toStrictEqual({
      checks: { database: 'fail', redis: 'ok' },
      service: 'scheduler',
      status: 'unavailable',
    });
    expect(readinessStatus).toBe(503);
    expect(metricsStatus).toBe(500);
  });
});
