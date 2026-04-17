import { Global, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../config/env.schema';
import { DRIZZLE, PG_POOL } from './database.constants';

@Global()
@Module({
  exports: [PG_POOL, DRIZZLE],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        return new Pool({
          connectionString: configService.get('DATABASE_URL', { infer: true }),
          max: configService.get('PG_POOL_MAX', { infer: true }),
          idleTimeoutMillis: configService.get('PG_POOL_IDLE_TIMEOUT_MS', { infer: true }),
          connectionTimeoutMillis: configService.get('PG_POOL_CONNECTION_TIMEOUT_MS', {
            infer: true,
          }),
        });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle({ client: pool }),
    },
    {
      provide: 'DATABASE_DISPOSER',
      inject: [PG_POOL],
      useFactory: (pool: Pool): OnModuleDestroy => {
        let endPromise: Promise<void> | undefined;

        return {
          onModuleDestroy: async () => {
            endPromise ??= pool.end();
            await endPromise;
          },
        };
      },
    },
  ],
})
export class DatabaseModule {}
