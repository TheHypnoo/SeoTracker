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

  @Get('engine-health')
  @ApiOperation({ summary: 'Salud global del motor: p50/p95 y tasa de error por etapa' })
  health(@Query() query: EngineHealthQueryDto) {
    return this.engineTelemetryService.getHealth({
      from: query.from,
      projectId: query.projectId,
      siteId: query.siteId,
      to: query.to,
    });
  }

  @Get('engine-health/timeseries')
  @ApiOperation({ summary: 'Salud global del motor: evolución diaria por etapa' })
  timeseries(@Query() query: EngineHealthTimeseriesQueryDto) {
    return this.engineTelemetryService.getHealthTimeseries({
      from: query.from,
      projectId: query.projectId,
      siteId: query.siteId,
      stage: query.stage,
      to: query.to,
    });
  }

  @Get('engine-health/model-versions')
  @ApiOperation({
    summary: 'Salud global del motor: comparación por versión del modelo de scoring',
  })
  modelVersions(@Query() query: EngineHealthQueryDto) {
    return this.engineTelemetryService.getModelVersionStats({
      from: query.from,
      projectId: query.projectId,
      siteId: query.siteId,
      to: query.to,
    });
  }
}
