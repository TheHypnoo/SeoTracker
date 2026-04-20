import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  exports: [NotificationsService],
  imports: [ProjectsModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
