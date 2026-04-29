import './tracing';

import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { startWorkerHttpServer } from '@seotracker/server';
import type { Env } from '@seotracker/server';
import { Logger } from 'nestjs-pino';

import { SchedulerModule } from './scheduler.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SchedulerModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService<Env, true>);
  const httpServer = await startWorkerHttpServer(app, {
    port: configService.get('SCHEDULER_HTTP_PORT', { infer: true }),
    serviceName: 'scheduler',
  });

  logger.log('Scheduler service started');

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      logger.log(`Received ${signal}. Shutting down scheduler service.`);
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
        'Failed to shut down scheduler service cleanly.',
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
