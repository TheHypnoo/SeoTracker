import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  ActivityLogModule,
  AlertsModule,
  AuditsModule,
  AuthModule,
  DatabaseModule,
  envSchema,
  ExportsModule,
  HealthModule,
  HttpMetricsInterceptor,
  InvitationsModule,
  LoggerHttpModule,
  MetricsModule,
  NotificationsModule,
  OutboundWebhooksModule,
  PublicBadgesModule,
  SitesModule,
  QueueModule,
  RequestIdMiddleware,
  SeoEngineModule,
  SystemLogsModule,
  UserOrIpThrottlerGuard,
  UsersModule,
  WebhooksModule,
  ProjectsModule,
} from '@seotracker/server';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw) => envSchema.parse(raw),
    }),
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    LoggerHttpModule,
    // Rate limits are per-user (or per-IP for anonymous), keyed by
    // UserOrIpThrottlerGuard. A single user action in this SPA fans out into
    // 5-15 requests (mutation + react-query invalidations + parallel queries
    // from sibling components), so budgets need real headroom.
    //  - default: 3000 req/min (~50 rps) for routine app traffic. The number
    //             looks high, but per-user it represents <1 user action per
    //             second over a sustained minute, which is generous but not
    //             abusive. Real attackers rotate identities, so per-user
    //             ceilings mostly catch buggy clients.
    //  - burst:   600 req in a 10s window. Covers reload/action storms like
    //             mass-mark-as-read (10 POSTs + 10 invalidation refetches +
    //             dashboard background queries). The previous 30/5s threshold
    //             tripped on legitimate batch UX.
    // Credential and public badge limits are applied as route-level overrides
    // of the `default` bucket. Do not register `auth` / `badge` here: named
    // throttlers in `forRoot` are global and would count normal app traffic.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 3000 },
      { name: 'burst', ttl: 10_000, limit: 600 },
    ]),
    MetricsModule,
    DatabaseModule,
    QueueModule,
    SystemLogsModule,
    SeoEngineModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    InvitationsModule,
    SitesModule,
    AlertsModule,
    AuditsModule,
    ExportsModule,
    WebhooksModule,
    OutboundWebhooksModule,
    NotificationsModule,
    HealthModule,
    ActivityLogModule,
    PublicBadgesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserOrIpThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
