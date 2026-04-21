import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post(':projectId/invites')
  @ApiOperation({ summary: 'Invitar miembro por email (solo owner)' })
  createInvite(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Body() body: CreateInviteDto,
  ) {
    return this.invitationsService.createInvite(projectId, user.sub, body);
  }

  @Post('invites/accept')
  @ApiOperation({ summary: 'Aceptar invitacion a project' })
  accept(@CurrentUser() user: { sub: string }, @Body() body: AcceptInviteDto) {
    return this.invitationsService.acceptInvite(user.sub, body);
  }
}
