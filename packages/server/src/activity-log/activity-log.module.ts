import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogListener } from './activity-log.listener';
import { ActivityLogService } from './activity-log.service';

@Module({
  imports: [ProjectsModule],
  providers: [ActivityLogService, ActivityLogListener],
  controllers: [ActivityLogController],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
