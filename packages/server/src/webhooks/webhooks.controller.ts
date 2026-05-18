import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuditsService } from '../audits/audits.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { TriggerWebhookAuditDto } from './dto-trigger.dto';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller()
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly auditsService: AuditsService,
  ) {}

  @Get('projects/:projectId/webhooks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar endpoints webhook de un project' })
  list(@CurrentUser() user: { sub: string }, @Param('projectId', UUID_V4_PIPE) projectId: string) {
    return this.webhooksService.listProjectEndpoints(projectId, user.sub);
  }

  @Post('projects/:projectId/webhooks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear endpoint webhook para un project' })
  create(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Body() body: CreateWebhookEndpointDto,
  ) {
    return this.webhooksService.createEndpoint(projectId, user.sub, body);
  }

  @Patch('projects/:projectId/webhooks/:endpointId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar endpoint webhook de un project' })
  update(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('endpointId', UUID_V4_PIPE) endpointId: string,
    @Body() body: UpdateWebhookEndpointDto,
  ) {
    return this.webhooksService.updateEndpoint(projectId, endpointId, user.sub, body);
  }

  @Post('projects/:projectId/webhooks/:endpointId/rotate-secret')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rotar secreto HMAC de un endpoint webhook' })
  rotateSecret(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('endpointId', UUID_V4_PIPE) endpointId: string,
  ) {
    return this.webhooksService.rotateEndpointSecret(projectId, endpointId, user.sub);
  }

  @Post('webhooks/incoming/:endpointKey')
  @ApiOperation({
    summary: 'Disparar auditoria externa via webhook firmado (HMAC)',
  })
  async triggerAudit(
    @Param('endpointKey') endpointKey: string,
    @Body() body: TriggerWebhookAuditDto,
    @Headers('x-seotracker-timestamp') timestamp: string | undefined,
    @Headers('x-seotracker-signature') signature: string | undefined,
  ) {
    const result = await this.webhooksService.verifyAndResolveProject({
      endpointKey,
      payload: body,
      signatureHeader: signature,
      siteId: body.siteId,
      timestampHeader: timestamp,
    });

    return this.auditsService.runWebhook(result.site.id);
  }
}
