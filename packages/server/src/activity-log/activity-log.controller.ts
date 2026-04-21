import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@seotracker/shared-types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectsService } from '../projects/projects.service';
import { ActivityLogService } from './activity-log.service';

@ApiTags('activity-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/activity')
export class ActivityLogController {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar actividad reciente del proyecto' })
  async list(
    @CurrentUser() user: { sub: string },
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    // Activity is gated on MEMBERS_READ — same audience that can see the
    // members list. Viewers can read it; non-members get ForbiddenException.
    await this.projectsService.assertPermission(projectId, user.sub, Permission.MEMBERS_READ);

    const parsedLimit = limit ? Number(limit) : undefined;
    const beforeDate = before ? new Date(before) : undefined;

    return this.activityLogService.listForProject(projectId, {
      pagination: resolvePagination({
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      }),
      before: beforeDate && !Number.isNaN(beforeDate.valueOf()) ? beforeDate : undefined,
    });
  }
}
