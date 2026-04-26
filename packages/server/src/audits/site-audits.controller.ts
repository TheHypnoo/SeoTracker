import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AuditsService } from './audits.service';
import { ListSiteAuditsQueryDto } from './dto/list-site-audits.query.dto';

@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites/:siteId/audits')
export class ProjectAuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  @Post('run')
  @ApiOperation({ summary: 'Lanzar auditoria manual' })
  run(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.auditsService.runManual(siteId, user.sub);
  }

  @Get('action-plan')
  @ApiOperation({ summary: 'Plan de accion SEO del ultimo audit completado' })
  actionPlan(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.auditsService.getSiteActionPlan(siteId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar auditorias por proyecto' })
  list(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: ListSiteAuditsQueryDto,
  ) {
    const { status, trigger, from, to, limit, offset } = query;
    return this.auditsService.listProjectRuns(siteId, user.sub, {
      from,
      pagination: resolvePagination({ limit, offset }),
      status,
      to,
      trigger,
    });
  }

  @Get('compare')
  @ApiOperation({ summary: 'Comparar dos auditorias de un proyecto' })
  compare(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditsService.compareProjectRuns(siteId, user.sub, from, to);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Histórico de score por proyecto' })
  trends(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(Math.max(Number(limit), 1), 100) : undefined;
    return this.auditsService.getProjectTrends(siteId, user.sub, parsed);
  }
}
