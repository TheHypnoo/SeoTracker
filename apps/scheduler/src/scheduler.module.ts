import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  DatabaseModule,
  envSchema,
  LoggerWorkerModule,
  MetricsModule,
  QueueModule,
  SchedulingModule,
  SystemLogsModule,
} from '@seotracker/server';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      validate: (raw) => envSchema.parse(raw),
    }),
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    LoggerWorkerModule,
    MetricsModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    QueueModule,
    SystemLogsModule,
    SchedulingModule,
  ],
})
export class SchedulerModule {}
