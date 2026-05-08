import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { PublicBadgesService } from './public-badges.service';

/**
 * Public (no auth) SVG badge endpoint. Rate-limited to 60 req/min per IP via a
 * route-level override of the default throttler. The global UserOrIpThrottlerGuard
 * falls back to IP when no JWT is present, so the unauthenticated tracker is the
 * caller's IP automatically.
 */
@ApiTags('public-badges')
@Controller('public/sites/:siteId')
export class PublicBadgesController {
  constructor(private readonly service: PublicBadgesService) {}

  @Get('badge.svg')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=300')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'SVG badge público (sin auth, opt-in por site)' })
  async svg(@Param('siteId') siteId: string): Promise<string> {
    const { svg } = await this.service.renderSvg(siteId);
    return svg;
  }
}
