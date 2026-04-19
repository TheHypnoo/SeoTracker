import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type IORedis from 'ioredis';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { REDIS_CONNECTION } from '../queue/queue.constants';

const READINESS_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${READINESS_TIMEOUT_MS}ms`)),
      READINESS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  @Get('liveness')
  @HttpCode(200)
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @HttpCode(200)
  async readiness() {
    const [dbResult, redisResult] = await Promise.allSettled([
      withTimeout(this.db.execute(sql`select 1`), 'database'),
      withTimeout(this.redis.ping(), 'redis'),
    ]);

    const dbOk = dbResult.status === 'fulfilled';
    const redisOk = redisResult.status === 'fulfilled';

    if (!dbOk || !redisOk) {
      const failures: Record<string, string> = {};
      if (!dbOk) {
        failures.database = (dbResult as PromiseRejectedResult).reason?.message ?? 'unknown error';
      }
      if (!redisOk) {
        failures.redis = (redisResult as PromiseRejectedResult).reason?.message ?? 'unknown error';
      }
      this.logger.warn(`Readiness check failed: ${JSON.stringify(failures)}`);
      throw new ServiceUnavailableException({
        checks: {
          database: dbOk ? 'ok' : 'fail',
          redis: redisOk ? 'ok' : 'fail',
        },
        failures,
        status: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      checks: { database: 'ok', redis: 'ok' },
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}
