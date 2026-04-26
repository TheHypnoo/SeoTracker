import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IssueState } from '@seotracker/shared-types';
import { IsEnum, IsOptional } from 'class-validator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { ProjectIssuesService } from './site-issues.service';

class ListSiteIssuesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IssueState)
  state?: IssueState;
}

class UpdateIssueStateDto {
  @IsEnum(IssueState)
  state!: IssueState;
}

@ApiTags('site-issues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('site-issues')
export class ProjectIssuesController {
  constructor(private readonly projectIssuesService: ProjectIssuesService) {}

  @Get('sites/:siteId')
  @ApiOperation({ summary: 'Listar issues persistentes de un sitio' })
  list(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: ListSiteIssuesQueryDto,
  ) {
    // Pagination on the site-scoped issue list was added by main, but the service in
    // focused-villani returns the full list. Strip the pagination arg until plumbed through.
    return this.projectIssuesService.listForProject(siteId, user.sub, { state: query.state });
  }

  @Patch(':id/state')
  @ApiOperation({ summary: 'Cambia el estado de un issue persistente (ignored / open)' })
  updateState(
    @CurrentUser() user: { sub: string },
    @Param('id', UUID_V4_PIPE) id: string,
    @Body() body: UpdateIssueStateDto,
  ) {
    return this.projectIssuesService.setState(id, user.sub, body.state);
  }
}
