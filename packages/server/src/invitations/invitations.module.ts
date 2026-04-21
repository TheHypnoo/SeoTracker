import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  controllers: [InvitationsController],
  exports: [InvitationsService],
  imports: [ProjectsModule, NotificationsModule],
  providers: [InvitationsService],
})
export class InvitationsModule {}
