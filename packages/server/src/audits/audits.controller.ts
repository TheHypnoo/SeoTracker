import { Controller, Inject, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IndexabilityStatus } from '@seotracker/shared-types';

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
  private readonly auditsService: AuditsService;

  constructor(@Inject(AuditsService) auditsService: unknown) {
    this.auditsService = auditsService as AuditsService;
  }

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
    @Query() query: unknown,
  ) {
    return this.auditsService.getAuditIssues(
      auditId,
      user.sub,
      resolvePagination(query as PaginationQueryDto),
    );
  }

  @Get(':auditId/indexability')
  @ApiOperation({ summary: 'Diagnostico de indexabilidad por URL' })
  getIndexability(
    @CurrentUser() user: { sub: string },
    @Param('auditId', UUID_V4_PIPE) auditId: string,
    @Query() queryInput: unknown,
  ) {
    const query = queryInput as PaginationQueryDto & {
      indexabilityStatus?: IndexabilityStatus;
      source?: string;
    };
    return this.auditsService.getAuditIndexability(auditId, user.sub, {
      indexabilityStatus: query.indexabilityStatus,
      pagination: resolvePagination(query),
      source: query.source,
    });
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
