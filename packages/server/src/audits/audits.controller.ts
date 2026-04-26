import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto, resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AuditsService } from './audits.service';

@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audits')
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  @Get(':auditId')
  @ApiOperation({ summary: 'Detalle de auditoria' })
  getAudit(@CurrentUser() user: { sub: string }, @Param('auditId', UUID_V4_PIPE) auditId: string) {
    return this.auditsService.getAuditRun(auditId, user.sub);
  }

  @Get(':auditId/issues')
  @ApiOperation({ summary: 'Issues detectados en auditoria' })
  getIssues(
    @CurrentUser() user: { sub: string },
    @Param('auditId', UUID_V4_PIPE) auditId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.auditsService.getAuditIssues(auditId, user.sub, resolvePagination(query));
  }

  @Get(':auditId/action-plan')
  @ApiOperation({ summary: 'Plan de accion SEO de una auditoria' })
  getActionPlan(
    @CurrentUser() user: { sub: string },
    @Param('auditId', UUID_V4_PIPE) auditId: string,
  ) {
    return this.auditsService.getAuditActionPlan(auditId, user.sub);
  }
}
