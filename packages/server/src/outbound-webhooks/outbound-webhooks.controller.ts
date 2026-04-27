import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { CreateOutboundWebhookDto } from './dto/create-outbound-webhook.dto';
import { UpdateOutboundWebhookDto } from './dto/update-outbound-webhook.dto';
import { OutboundWebhooksService } from './outbound-webhooks.service';

@ApiTags('outbound-webhooks')
@Controller('projects/:projectId/outbound-webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OutboundWebhooksController {
  constructor(private readonly service: OutboundWebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar integraciones salientes del project' })
  list(@CurrentUser() user: { sub: string }, @Param('projectId', UUID_V4_PIPE) projectId: string) {
    return this.service.list(projectId, user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva integración saliente' })
  create(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Body() body: CreateOutboundWebhookDto,
  ) {
    return this.service.create(projectId, user.sub, body);
  }

  @Patch(':webhookId')
  @ApiOperation({ summary: 'Actualizar una integración saliente' })
  update(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
    @Body() body: UpdateOutboundWebhookDto,
  ) {
    return this.service.update(projectId, webhookId, user.sub, body);
  }

  @Delete(':webhookId')
  @ApiOperation({ summary: 'Eliminar una integración saliente' })
  remove(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
  ) {
    return this.service.remove(projectId, webhookId, user.sub);
  }

  @Post(':webhookId/rotate-secret')
  @ApiOperation({ summary: 'Rotar el secreto HMAC de una integración' })
  rotateSecret(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
  ) {
    return this.service.rotateSecret(projectId, webhookId, user.sub);
  }

  @Get(':webhookId/secret')
  @ApiOperation({ summary: 'Obtener el secreto actual de una integración' })
  revealSecret(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
  ) {
    return this.service.revealSecret(projectId, webhookId, user.sub);
  }

  @Post(':webhookId/test')
  @ApiOperation({ summary: 'Enviar una prueba (test.ping) a la URL configurada' })
  sendTest(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
  ) {
    return this.service.sendTestDelivery(projectId, webhookId, user.sub);
  }

  @Get(':webhookId/deliveries')
  @ApiOperation({ summary: 'Listar entregas recientes de una integración' })
  listDeliveries(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('webhookId', UUID_V4_PIPE) webhookId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.service.listDeliveries(projectId, webhookId, user.sub, {
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }
}
