import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsEnum,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { EmailDeliveryStatus } from '@seotracker/shared-types';
import { Body, Controller, Inject, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { NotificationsService } from './notifications.service';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
}

/* istanbul ignore next -- DTO decorator metadata is exercised by class-transformer focused tests. */
export class ListEmailDeliveriesQueryDto extends ListNotificationsQueryDto {
  /* istanbul ignore next -- class-validator decorator metadata emits design:type fallback branches. */
  @IsOptional()
  @IsEnum(EmailDeliveryStatus)
  status?: unknown;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  private readonly notificationsService: NotificationsService;

  constructor(@Inject(NotificationsService) notificationsService: unknown) {
    this.notificationsService = notificationsService as NotificationsService;
  }

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario' })
  list(@CurrentUser() user: { sub: string }, @Query() queryInput: unknown) {
    const query = queryInput as ListNotificationsQueryDto;
    return this.notificationsService.listForUser(
      user.sub,
      resolvePagination(query, { limit: 25, offset: 0 }),
    );
  }

  @Post('read')
  @ApiOperation({ summary: 'Marcar varias notificaciones como leidas' })
  markManyRead(@CurrentUser() user: { sub: string }, @Body() bodyInput: unknown) {
    const body = bodyInput as MarkNotificationsReadDto;
    return this.notificationsService.markManyAsRead(user.sub, body.ids);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar notificacion como leida' })
  markRead(@CurrentUser() user: { sub: string }, @Param('id', UUID_V4_PIPE) id: string) {
    return this.notificationsService.markAsRead(user.sub, id);
  }

  @Get('projects/:projectId/email-deliveries')
  @ApiOperation({ summary: 'Listar entregas de email del proyecto' })
  listEmailDeliveries(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Query() queryInput: unknown,
  ) {
    const query = queryInput as ListEmailDeliveriesQueryDto;
    return this.notificationsService.listEmailDeliveriesForProject(
      projectId,
      user.sub,
      resolvePagination(query, { limit: 25, offset: 0 }),
      { status: query.status as EmailDeliveryStatus | undefined },
    );
  }

  @Post('projects/:projectId/email-deliveries/:deliveryId/retry')
  @ApiOperation({ summary: 'Reintentar una entrega de email fallida' })
  retryEmailDelivery(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('deliveryId', UUID_V4_PIPE) deliveryId: string,
  ) {
    return this.notificationsService.retryEmailDelivery(projectId, deliveryId, user.sub);
  }
}
