import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SitesModule } from '../sites/sites.module';
import { AlertsService } from './alerts.service';
import { ProjectAlertsController } from './site-alerts.controller';

@Module({
  controllers: [ProjectAlertsController],
  exports: [AlertsService],
  imports: [SitesModule, NotificationsModule],
  providers: [AlertsService],
})
export class AlertsModule {}
