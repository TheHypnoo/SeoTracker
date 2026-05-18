import { Controller, Inject, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto, resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AuditsService } from './audits.service';

@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites/:siteId/comparisons')
export class ProjectComparisonsController {
  private readonly auditsService: AuditsService;

  constructor(@Inject(AuditsService) auditsService: unknown) {
    this.auditsService = auditsService as AuditsService;
  }

  @Get()
  @ApiOperation({ summary: 'Listar comparativas persistidas de un proyecto' })
  list(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() queryInput: unknown,
  ) {
    const query = queryInput as PaginationQueryDto;
    return this.auditsService.listProjectComparisons(
      siteId,
      user.sub,
      resolvePagination({ limit: query.limit, offset: query.offset }, { limit: 50, offset: 0 }),
    );
  }
}
