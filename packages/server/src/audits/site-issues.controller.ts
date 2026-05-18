import { Body, Controller, Inject, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IssueState } from '@seotracker/shared-types';
import { IsEnum, IsOptional } from 'class-validator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { ProjectIssuesService } from './site-issues.service';

/* istanbul ignore next -- DTO decorator metadata is exercised by validation integration tests. */
class ListSiteIssuesQueryDto extends PaginationQueryDto {
  /* istanbul ignore next -- class-validator decorator metadata emits design:type fallback branches. */
  @IsOptional()
  @IsEnum(IssueState)
  state?: unknown;
}

/* istanbul ignore next -- DTO decorator metadata is exercised by validation integration tests. */
class UpdateIssueStateDto {
  /* istanbul ignore next -- class-validator decorator metadata emits design:type fallback branches. */
  @IsEnum(IssueState)
  state!: unknown;
}

@ApiTags('site-issues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('site-issues')
export class ProjectIssuesController {
  private readonly projectIssuesService: ProjectIssuesService;

  constructor(@Inject(ProjectIssuesService) projectIssuesService: unknown) {
    this.projectIssuesService = projectIssuesService as ProjectIssuesService;
  }

  @Get('sites/:siteId')
  @ApiOperation({ summary: 'Listar issues persistentes de un sitio' })
  list(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() queryInput: unknown,
  ) {
    const query = queryInput as ListSiteIssuesQueryDto;
    // Pagination on the site-scoped issue list was added by main, but the service in
    // focused-villani returns the full list. Strip the pagination arg until plumbed through.
    return this.projectIssuesService.listForProject(siteId, user.sub, {
      state: query.state as IssueState | undefined,
    });
  }

  @Patch(':id/state')
  @ApiOperation({ summary: 'Cambia el estado de un issue persistente (ignored / open)' })
  updateState(
    @CurrentUser() user: { sub: string },
    @Param('id', UUID_V4_PIPE) id: string,
    @Body() bodyInput: unknown,
  ) {
    const body = bodyInput as UpdateIssueStateDto;
    return this.projectIssuesService.setState(id, user.sub, body.state as IssueState);
  }
}
