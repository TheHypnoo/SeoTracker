import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AuditsModule,
  AuditsProcessor,
  DatabaseModule,
  EmailDeliveriesProcessor,
  envSchema,
  ExportsModule,
  ExportsProcessor,
  LoggerWorkerModule,
  MetricsModule,
  NotificationsModule,
  OutboundWebhooksModule,
  OutboundWebhooksProcessor,
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
    AuditsModule,
    ExportsModule,
    OutboundWebhooksModule,
    NotificationsModule,
    SchedulingModule,
  ],
  providers: [
    AuditsProcessor,
    ExportsProcessor,
    OutboundWebhooksProcessor,
    EmailDeliveriesProcessor,
  ],
})
export class WorkerModule {}
