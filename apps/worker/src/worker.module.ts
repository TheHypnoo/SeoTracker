import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AuditsModule,
  AuditsProcessor,
  DatabaseModule,
  EmailDeliveriesProcessor,
  ExportsModule,
  ExportsProcessor,
  GscImportProcessor,
  LoggerWorkerModule,
  MetricsModule,
  NotificationsModule,
  OutboundWebhooksModule,
  OutboundWebhooksProcessor,
  QueueModule,
  SchedulingModule,
  SearchConsoleModule,
  SystemLogsModule,
  workerEnvSchema,
} from '@seotracker/server';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      validate: (raw) => workerEnvSchema.parse(raw),
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
    SearchConsoleModule,
    SchedulingModule,
  ],
  providers: [
    AuditsProcessor,
    ExportsProcessor,
    OutboundWebhooksProcessor,
    EmailDeliveriesProcessor,
    GscImportProcessor,
  ],
})
export class WorkerModule {}
