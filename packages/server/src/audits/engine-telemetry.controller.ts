import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import {
  EngineHealthQueryDto,
  EngineHealthTimeseriesQueryDto,
} from './dto/engine-health.query.dto';
import { EngineTelemetryService } from './engine-telemetry.service';

/**
 * Internal observability of the SEO engine. Gated behind PlatformAdminGuard:
 * these endpoints expose engine performance/reliability internals and are for
 * platform operators only, never for project members.
 */
@ApiTags('engine-telemetry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller()
export class EngineTelemetryController {
  constructor(private readonly engineTelemetryService: EngineTelemetryService) {}

  @Get('audits/:auditId/engine-telemetry')
  @ApiOperation({ summary: 'Telemetria del motor por etapa (waterfall de la auditoria)' })
  getRunTimeline(@Param('auditId', UUID_V4_PIPE) auditId: string) {
    return this.engineTelemetryService.getRunTimeline(auditId);
  }

  @Get('sites/:siteId/audits/engine-health')
  @ApiOperation({ summary: 'Salud del motor: p50/p95 y tasa de error por etapa' })
  health(@Param('siteId', UUID_V4_PIPE) siteId: string, @Query() query: EngineHealthQueryDto) {
    return this.engineTelemetryService.getSiteHealth(siteId, { from: query.from, to: query.to });
  }

  @Get('sites/:siteId/audits/engine-health/timeseries')
  @ApiOperation({ summary: 'Salud del motor: evolución diaria por etapa' })
  timeseries(
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: EngineHealthTimeseriesQueryDto,
  ) {
    return this.engineTelemetryService.getSiteHealthTimeseries(siteId, {
      from: query.from,
      to: query.to,
      stage: query.stage,
    });
  }

  @Get('sites/:siteId/audits/engine-health/model-versions')
  @ApiOperation({ summary: 'Salud del motor: comparación por versión del modelo de scoring' })
  modelVersions(
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: EngineHealthQueryDto,
  ) {
    return this.engineTelemetryService.getModelVersionStats(siteId, {
      from: query.from,
      to: query.to,
    });
  }
}
