import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { ExportsController } from './exports.controller';
import { ExportsProcessor } from './exports.processor';
import { ExportsService } from './exports.service';
import {
  AuditResultCsvStrategy,
  ComparisonCsvStrategy,
  CSV_BUILDER_STRATEGIES,
  HistoryCsvStrategy,
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
    {
      provide: CSV_BUILDER_STRATEGIES,
      useFactory: (
        history: HistoryCsvStrategy,
        issues: IssuesCsvStrategy,
        metrics: MetricsCsvStrategy,
        comparison: ComparisonCsvStrategy,
        auditResult: AuditResultCsvStrategy,
      ) => [history, issues, metrics, comparison, auditResult],
      inject: [
        HistoryCsvStrategy,
        IssuesCsvStrategy,
        MetricsCsvStrategy,
        ComparisonCsvStrategy,
        AuditResultCsvStrategy,
      ],
    },
  ],
  exports: [ExportsService],
})
export class ExportsModule {}
