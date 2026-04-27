import { Module } from '@nestjs/common';

import { PublicBadgesController } from './public-badges.controller';
import { PublicBadgesService } from './public-badges.service';

/**
 * Public, unauthenticated SVG badges. The single endpoint here is gated by
 * a per-IP throttle (60/min) and reads from a Redis cache so a viral embed
 * can't hammer the database. The opt-in toggle lives in the authenticated
 * sites module — see PublicBadgeAdminService.
 *
 * QueueModule is `@Global()`, so REDIS_CONNECTION is available without an
 * explicit import here.
 */
@Module({
  controllers: [PublicBadgesController],
  providers: [PublicBadgesService],
  exports: [PublicBadgesService],
})
export class PublicBadgesModule {}
