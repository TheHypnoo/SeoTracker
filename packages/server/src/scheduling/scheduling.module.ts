import { Module } from '@nestjs/common';

import { AuditsModule } from '../audits/audits.module';
import { ExportsModule } from '../exports/exports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [AuditsModule, ExportsModule, NotificationsModule, OutboundWebhooksModule],
  providers: [SchedulingService],
})
export class SchedulingModule {}
