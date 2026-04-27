import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { OutboundWebhooksController } from './outbound-webhooks.controller';
import { OutboundWebhooksService } from './outbound-webhooks.service';

@Module({
  controllers: [OutboundWebhooksController],
  exports: [OutboundWebhooksService],
  imports: [ProjectsModule],
  providers: [OutboundWebhooksService],
})
export class OutboundWebhooksModule {}
