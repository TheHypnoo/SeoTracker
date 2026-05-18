import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AuditsService } from './audits.service';
import { ListProjectAuditsQueryDto } from './dto/list-project-audits.query.dto';
import { ListProjectIssuesQueryDto } from './dto/list-project-issues.query.dto';
import { ProjectIssuesService } from './site-issues.service';

@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId')
export class ProjectScopedAuditsController {
  private readonly auditsService: AuditsService;
  private readonly issuesService: ProjectIssuesService;

  constructor(
    @Inject(AuditsService) auditsService: unknown,
    @Inject(ProjectIssuesService) issuesService: unknown,
  ) {
    this.auditsService = auditsService as AuditsService;
    this.issuesService = issuesService as ProjectIssuesService;
  }

  @Get('audits')
  @ApiOperation({ summary: 'Listar auditorías de todos los dominios del proyecto' })
  listAudits(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Query() query: unknown,
  ) {
    const { siteId, status, trigger, limit, offset } = query as ListProjectAuditsQueryDto;
    return this.auditsService.listAuditsForProject(projectId, user.sub, {
      pagination: resolvePagination({ limit, offset }),
      siteId,
      status,
      trigger,
    });
  }

  @Get('site-issues')
  @ApiOperation({ summary: 'Listar incidencias agregadas del proyecto' })
  listIssues(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Query() query: unknown,
  ) {
    const { siteId, severity, category, state, limit, offset } = query as ListProjectIssuesQueryDto;
    return this.issuesService.listForProjectScope(projectId, user.sub, {
      category,
      pagination: resolvePagination({ limit, offset }),
      severity,
      siteId,
      state,
    });
  }
}
