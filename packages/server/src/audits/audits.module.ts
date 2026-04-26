import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { SeoEngineModule } from '../seo-engine/seo-engine.module';
import { AuditComparisonService } from './audit-comparison.service';
import { AuditOrchestrationService } from './audit-orchestration.service';
import { AuditProcessingService } from './audit-processing.service';
import { AuditReadingService } from './audit-reading.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { ProjectScopedAuditsController } from './project-scoped.controller';
import { ProjectComparisonsController } from './site-comparisons.controller';
import { ProjectAuditsController } from './site-audits.controller';
import { ProjectIssuesController } from './site-issues.controller';
import { ProjectIssuesService } from './site-issues.service';
import { SeoActionPlanService } from './seo-action-plan.service';

@Module({
  controllers: [
    ProjectAuditsController,
    ProjectComparisonsController,
    ProjectIssuesController,
    ProjectScopedAuditsController,
    AuditsController,
  ],
  exports: [
    AuditsService,
    AuditOrchestrationService,
    AuditProcessingService,
    AuditComparisonService,
    AuditReadingService,
    SeoActionPlanService,
    ProjectIssuesService,
  ],
  imports: [
    SitesModule,
    SeoEngineModule,
    NotificationsModule,
    AlertsModule,
    OutboundWebhooksModule,
    ProjectsModule,
  ],
  providers: [
    AuditOrchestrationService,
    AuditProcessingService,
    AuditComparisonService,
    AuditReadingService,
    SeoActionPlanService,
    AuditsService,
    ProjectIssuesService,
  ],
})
export class AuditsModule {}
