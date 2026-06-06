import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { ImportSearchConsoleDataDto } from './dto/import-search-console-data.dto';
import { LinkSearchConsolePropertyDto } from './dto/link-search-console-property.dto';
import { SearchConsoleBrandQueryDto } from './dto/search-console-brand.query.dto';
import { SearchConsoleKeywordQueryDto } from './dto/search-console-keyword.query.dto';
import { SearchConsoleRangeQueryDto } from './dto/search-console-range.query.dto';
import { SyncSearchConsolePropertiesDto } from './dto/sync-search-console-properties.dto';
import { TrackKeywordDto } from './dto/track-keyword.dto';

// Endpoints that call the Google API + write to the DB are capped tighter than the global bucket
// so a single user cannot spam expensive imports/syncs.
const GSC_WRITE_THROTTLE = { default: { limit: 10, ttl: 60_000 } } as const;
import { SearchConsoleService } from './search-console.service';

@ApiTags('search-console')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/search-console/properties')
export class SearchConsoleController {
  constructor(private readonly searchConsoleService: SearchConsoleService) {}

  @Get()
  @ApiOperation({ summary: 'List synced Google Search Console properties for a project' })
  list(@CurrentUser() user: { sub: string }, @Param('projectId', UUID_V4_PIPE) projectId: string) {
    return this.searchConsoleService.listProperties(projectId, user.sub);
  }

  @Post('sync')
  @Throttle(GSC_WRITE_THROTTLE)
  @ApiOperation({ summary: 'Sync Google Search Console properties from a Google connection' })
  sync(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Body() body: SyncSearchConsolePropertiesDto,
  ) {
    return this.searchConsoleService.syncProperties(projectId, user.sub, body.googleConnectionId);
  }
}

@ApiTags('search-console')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites/:siteId/search-console')
export class SiteSearchConsoleController {
  constructor(private readonly searchConsoleService: SearchConsoleService) {}

  @Get()
  @ApiOperation({ summary: 'Get the active Search Console property linked to a site' })
  getLinked(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.searchConsoleService.getLinkedProperty(siteId, user.sub);
  }

  @Get('candidates')
  @ApiOperation({ summary: 'List candidate Search Console properties for a site' })
  candidates(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.searchConsoleService.listCandidates(siteId, user.sub);
  }

  @Post('link')
  @ApiOperation({ summary: 'Link a synced Search Console property to a site' })
  link(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Body() body: LinkSearchConsolePropertyDto,
  ) {
    return this.searchConsoleService.linkProperty(siteId, user.sub, body.searchConsolePropertyId);
  }

  @Delete('link')
  @ApiOperation({ summary: 'Unlink the active Search Console property from a site' })
  unlink(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.searchConsoleService.unlinkProperty(siteId, user.sub);
  }

  @Post('performance/import')
  @Throttle(GSC_WRITE_THROTTLE)
  @ApiOperation({ summary: 'Import Search Console performance data for a linked site' })
  importPerformance(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Body() body: ImportSearchConsoleDataDto,
  ) {
    return this.searchConsoleService.importPerformance(siteId, user.sub, body);
  }

  @Get('performance/summary')
  @ApiOperation({ summary: 'Get Search Console performance summary for a linked site' })
  summary(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getPerformanceSummary(siteId, user.sub, query);
  }

  @Get('performance/timeseries')
  @ApiOperation({ summary: 'Get Search Console daily performance for a linked site' })
  timeseries(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getPerformanceTimeseries(siteId, user.sub, query);
  }

  @Get('performance/top-queries')
  @ApiOperation({ summary: 'Get top Search Console queries for a linked site' })
  topQueries(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getTopQueries(siteId, user.sub, query);
  }

  @Get('performance/top-pages')
  @ApiOperation({ summary: 'Get top Search Console pages for a linked site' })
  topPages(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getTopPages(siteId, user.sub, query);
  }

  @Get('performance/top-countries')
  @ApiOperation({ summary: 'Get top Search Console countries for a linked site' })
  topCountries(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getTopCountries(siteId, user.sub, query);
  }

  @Get('performance/top-devices')
  @ApiOperation({ summary: 'Get top Search Console devices for a linked site' })
  topDevices(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getTopDevices(siteId, user.sub, query);
  }

  @Get('performance/opportunities')
  @ApiOperation({ summary: 'Get striking-distance keyword opportunities for a linked site' })
  opportunities(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getOpportunities(siteId, user.sub, query);
  }

  @Get('performance/cannibalization')
  @ApiOperation({ summary: 'Get keyword cannibalization groups for a linked site' })
  cannibalization(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getCannibalization(siteId, user.sub, query);
  }

  @Get('performance/decay')
  @ApiOperation({ summary: 'Get decaying pages (losing clicks) for a linked site' })
  decay(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.getDecay(siteId, user.sub, query);
  }

  @Get('keywords')
  @ApiOperation({ summary: 'List tracked keywords with their metrics for a linked site' })
  listKeywords(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleRangeQueryDto,
  ) {
    return this.searchConsoleService.listTrackedKeywords(siteId, user.sub, query);
  }

  @Post('keywords')
  @ApiOperation({ summary: 'Start tracking a Search Console query for a site' })
  trackKeyword(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Body() body: TrackKeywordDto,
  ) {
    return this.searchConsoleService.trackKeyword(siteId, user.sub, body.query);
  }

  @Delete('keywords')
  @ApiOperation({ summary: 'Stop tracking a Search Console query for a site' })
  untrackKeyword(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query('query') query: string,
  ) {
    return this.searchConsoleService.untrackKeyword(siteId, user.sub, query);
  }

  @Get('performance/brand-split')
  @ApiOperation({ summary: 'Get branded vs non-branded performance for a linked site' })
  brandSplit(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleBrandQueryDto,
  ) {
    return this.searchConsoleService.getBrandSplit(siteId, user.sub, {
      brandTerms: query.brandTerms ? query.brandTerms.split(',') : [],
      endDate: query.endDate,
      startDate: query.startDate,
    });
  }

  @Get('performance/keyword-timeseries')
  @ApiOperation({ summary: 'Get the daily timeseries for a single tracked keyword' })
  keywordTimeseries(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: SearchConsoleKeywordQueryDto,
  ) {
    return this.searchConsoleService.getKeywordTimeseries(siteId, user.sub, query);
  }
}
