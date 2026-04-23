import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AlertsService } from './alerts.service';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites/:siteId/alerts')
export class ProjectAlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener regla de alertas de un proyecto' })
  getRule(@CurrentUser() user: { sub: string }, @Param('siteId', UUID_V4_PIPE) siteId: string) {
    return this.alertsService.getForProject(siteId, user.sub);
  }

  @Put()
  @ApiOperation({ summary: 'Actualizar regla de alertas de un proyecto' })
  updateRule(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Body() body: UpdateAlertRuleDto,
  ) {
    return this.alertsService.updateForProject(siteId, user.sub, body);
  }
}
