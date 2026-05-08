import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { ExportsController } from './exports.controller';
import { ExportsProcessor } from './exports.processor';
import { ExportsService } from './exports.service';
import {
  AuditResultCsvStrategy,
  ActionPlanCsvStrategy,
  ComparisonCsvStrategy,
  CSV_BUILDER_STRATEGIES,
  HistoryCsvStrategy,
  IndexabilityCsvStrategy,
  IssuesCsvStrategy,
  MetricsCsvStrategy,
} from './strategies';

@Module({
  imports: [SitesModule, ProjectsModule],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    ExportsProcessor,
    HistoryCsvStrategy,
    IssuesCsvStrategy,
    MetricsCsvStrategy,
    ComparisonCsvStrategy,
    AuditResultCsvStrategy,
    ActionPlanCsvStrategy,
    IndexabilityCsvStrategy,
    {
      provide: CSV_BUILDER_STRATEGIES,
      useFactory: (
        history: HistoryCsvStrategy,
        issues: IssuesCsvStrategy,
        metrics: MetricsCsvStrategy,
        comparison: ComparisonCsvStrategy,
        auditResult: AuditResultCsvStrategy,
        actionPlan: ActionPlanCsvStrategy,
        indexability: IndexabilityCsvStrategy,
      ) => [history, issues, metrics, comparison, auditResult, actionPlan, indexability],
      inject: [
        HistoryCsvStrategy,
        IssuesCsvStrategy,
        MetricsCsvStrategy,
        ComparisonCsvStrategy,
        AuditResultCsvStrategy,
        ActionPlanCsvStrategy,
        IndexabilityCsvStrategy,
      ],
    },
  ],
  exports: [ExportsService],
})
export class ExportsModule {}
