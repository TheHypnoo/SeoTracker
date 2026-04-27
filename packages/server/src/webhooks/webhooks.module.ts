import { Module } from '@nestjs/common';

import { AuditsModule } from '../audits/audits.module';
import { ProjectsModule } from '../projects/projects.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  exports: [WebhooksService],
  imports: [AuditsModule, ProjectsModule],
  providers: [WebhooksService],
})
export class WebhooksModule {}
