import { Global, Logger, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import type { Env } from '../config/env.schema';
import { BullmqMetricsCollector } from './bullmq-metrics.collector';
import { DistributedLockService } from './distributed-lock.service';
import { JobFailuresService } from './job-failures.service';
import {
  AUDIT_QUEUE,
  AUDIT_QUEUE_NAME,
  DISTRIBUTED_LOCK,
  EMAIL_DELIVERIES_QUEUE,
  EMAIL_DELIVERIES_QUEUE_NAME,
  EXPORT_QUEUE,
  EXPORT_QUEUE_NAME,
  OUTBOUND_DELIVERIES_QUEUE,
  OUTBOUND_DELIVERIES_QUEUE_NAME,
  REDIS_CONNECTION,
} from './queue.constants';
import { QueueService } from './queue.service';

const QUEUE_DISPOSER = Symbol('QUEUE_DISPOSER');

@Global()
@Module({
  exports: [
    REDIS_CONNECTION,
    AUDIT_QUEUE,
    EXPORT_QUEUE,
    OUTBOUND_DELIVERIES_QUEUE,
    EMAIL_DELIVERIES_QUEUE,
    DISTRIBUTED_LOCK,
    DistributedLockService,
    JobFailuresService,
    QueueService,
  ],
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get('REDIS_URL', { infer: true });

        return new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: false,
        });
      },
    },
    {
      provide: AUDIT_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get('REDIS_URL', { infer: true });

        return new Queue(AUDIT_QUEUE_NAME, { connection: { url: redisUrl } });
      },
    },
    {
      provide: EXPORT_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get('REDIS_URL', { infer: true });

        return new Queue(EXPORT_QUEUE_NAME, { connection: { url: redisUrl } });
      },
    },
    {
      provide: OUTBOUND_DELIVERIES_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get('REDIS_URL', { infer: true });

        return new Queue(OUTBOUND_DELIVERIES_QUEUE_NAME, { connection: { url: redisUrl } });
      },
    },
    {
      provide: EMAIL_DELIVERIES_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get('REDIS_URL', { infer: true });

        return new Queue(EMAIL_DELIVERIES_QUEUE_NAME, { connection: { url: redisUrl } });
      },
    },
    {
      provide: DISTRIBUTED_LOCK,
      useExisting: DistributedLockService,
    },
    DistributedLockService,
    JobFailuresService,
    QueueService,
    BullmqMetricsCollector,
    {
      provide: QUEUE_DISPOSER,
      inject: [
        REDIS_CONNECTION,
        AUDIT_QUEUE,
        EXPORT_QUEUE,
        OUTBOUND_DELIVERIES_QUEUE,
        EMAIL_DELIVERIES_QUEUE,
      ],
      useFactory: (
        redis: IORedis,
        auditQueue: Queue,
        exportQueue: Queue,
        outboundQueue: Queue,
        emailQueue: Queue,
      ): OnModuleDestroy => {
        const packageName = process.env.npm_package_name ?? 'app';
        const logger = new Logger(`QueueModule:${packageName}`);
        let closePromise: Promise<void> | undefined;

        return {
          onModuleDestroy: async () => {
            closePromise ??= (async () => {
              logger.log('Closing BullMQ queues and Redis connection...');
              await Promise.allSettled([
                auditQueue.close(),
                exportQueue.close(),
                outboundQueue.close(),
                emailQueue.close(),
              ]);
              await redis.quit().catch(() => redis.disconnect());
              logger.log('Queues and Redis connection closed.');
            })();
            await closePromise;
          },
        };
      },
    },
  ],
})
export class QueueModule {}
