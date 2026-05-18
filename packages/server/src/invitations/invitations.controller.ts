import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
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
  private readonly invitationsService: InvitationsService;

  constructor(@Inject(InvitationsService) invitationsService: unknown) {
    this.invitationsService = invitationsService as InvitationsService;
  }

  @Post(':projectId/invites')
  @ApiOperation({ summary: 'Invitar miembro por email (solo owner)' })
  createInvite(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Body() body: unknown,
  ) {
    return this.invitationsService.createInvite(projectId, user.sub, body as CreateInviteDto);
  }

  @Post('invites/accept')
  @ApiOperation({ summary: 'Aceptar invitacion a project' })
  accept(@CurrentUser() user: { sub: string }, @Body() body: unknown) {
    return this.invitationsService.acceptInvite(user.sub, body as AcceptInviteDto);
  }
}
