import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type IORedis from 'ioredis';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { evaluateMetricsAccess } from '../metrics/metrics-auth';
import { MetricsService } from '../metrics/metrics.service';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { withTimeout } from './utils/with-timeout';

const READINESS_TIMEOUT_MS = 3000;

/**
 * Minimal HTTP server for non-HTTP Nest contexts (workers, scheduler).
 * Serves only:
 *   - GET /health/liveness
 *   - GET /health/readiness
 *   - GET /metrics  (Prometheus exposition)
 *
 * Anything else returns 404. Bind only to a private/internal port — do not
 * expose this to the public internet.
 */
export async function startWorkerHttpServer(
  app: INestApplicationContext,
  options: { port: number; serviceName: string },
): Promise<Server> {
  const logger = new Logger(`WorkerHttpServer:${options.serviceName}`);
  const metricsService = app.get(MetricsService);
  const db = app.get<Db>(DRIZZLE);
  const redis = app.get<IORedis>(REDIS_CONNECTION);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    /* istanbul ignore next -- Node HTTP requests always provide a URL for inbound requests. */
    const url = req.url ?? '/';
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }

    if (url === '/health/liveness') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ service: options.serviceName, status: 'ok' }));
      return;
    }

    if (url === '/health/readiness') {
      const [dbResult, redisResult] = await Promise.allSettled([
        withTimeout(db.execute(sql`select 1`), 'database', READINESS_TIMEOUT_MS),
        withTimeout(redis.ping(), 'redis', READINESS_TIMEOUT_MS),
      ]);
      const dbOk = dbResult.status === 'fulfilled';
      const redisOk = redisResult.status === 'fulfilled';
      const status = dbOk && redisOk ? 200 : 503;
      res.writeHead(status, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          checks: { database: dbOk ? 'ok' : 'fail', redis: redisOk ? 'ok' : 'fail' },
          service: options.serviceName,
          status: dbOk && redisOk ? 'ready' : 'unavailable',
        }),
      );
      return;
    }

    if (url === '/metrics') {
      // Gate metrics behind METRICS_TOKEN exactly like the API's MetricsController
      // so worker metrics aren't exposed unauthenticated if the worker port ever
      // becomes publicly routable.
      const decision = evaluateMetricsAccess({
        nodeEnv: process.env.NODE_ENV ?? 'development',
        configuredToken: process.env.METRICS_TOKEN,
        authorization: req.headers.authorization,
        metricsTokenHeader: req.headers['x-metrics-token'],
      });
      if (decision === 'not-found') {
        res.writeHead(404).end();
        return;
      }
      if (decision === 'unauthorized') {
        res.writeHead(401).end();
        return;
      }

      try {
        const body = await metricsService.metrics();
        res.writeHead(200, { 'content-type': metricsService.contentType() }).end(body);
      } catch (error) {
        logger.error(`metrics endpoint errored: ${String(error)}`);
        res.writeHead(500).end();
      }
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  logger.log(
    `Worker HTTP server listening on :${options.port} (health/liveness, health/readiness, metrics)`,
  );

  return server;
}
