import './tracing';

import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { startWorkerHttpServer } from '@seotracker/server';
import type { Env } from '@seotracker/server';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService<Env, true>);
  const railwayPort = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : undefined;
  const httpPort =
    railwayPort && Number.isInteger(railwayPort)
      ? railwayPort
      : configService.get('JOBS_HTTP_PORT', { infer: true });

  const httpServer = await startWorkerHttpServer(app, {
    port: httpPort,
    serviceName: 'worker',
  });

  logger.log('Worker service started');

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      logger.log(`Received ${signal}. Shutting down worker service.`);
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await app.close();
      process.exitCode = 0;
    })().catch((error: unknown) => {
      logger.error(
        'Failed to shut down worker service cleanly.',
        error instanceof Error ? error.stack : String(error),
      );
      process.exit(1);
    });
    return shutdownPromise;
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap();
