import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
    DatabaseModule,
    QueueModule,
    SystemLogsModule,
    AuditsModule,
    ExportsModule,
    OutboundWebhooksModule,
    NotificationsModule,
  ],
  providers: [
    AuditsProcessor,
    ExportsProcessor,
    OutboundWebhooksProcessor,
    EmailDeliveriesProcessor,
  ],
})
export class JobsModule {}
