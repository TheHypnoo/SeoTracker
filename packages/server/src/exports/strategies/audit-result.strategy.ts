import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import {
  auditActionItems,
  auditIssues,
  auditMetrics,
  auditPages,
  auditRuns,
  auditUrlInspections,
} from '../../database/schema';
import type { CsvBuilderStrategy, CsvCell, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class AuditResultCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.AUDIT_RESULT;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.auditRunId) {
      throw new BadRequestException('Audit result export requires an auditRunId');
    }

    const [run, metrics, pages, issues, actions, inspections] = await Promise.all([
      this.db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.id, exportRecord.auditRunId))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(auditMetrics)
        .where(eq(auditMetrics.auditRunId, exportRecord.auditRunId)),
      this.db.select().from(auditPages).where(eq(auditPages.auditRunId, exportRecord.auditRunId)),
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, exportRecord.auditRunId)),
      this.db
        .select()
        .from(auditActionItems)
        .where(eq(auditActionItems.auditRunId, exportRecord.auditRunId)),
      this.db
        .select()
        .from(auditUrlInspections)
        .where(eq(auditUrlInspections.auditRunId, exportRecord.auditRunId)),
    ]);

    if (!run) {
      throw new NotFoundException('Audit run not found');
    }

    const rows: CsvCell[][] = [
      ['summary', 'auditId', run.id],
      ['summary', 'status', run.status],
      ['summary', 'score', String(run.score ?? '')],
      ['summary', 'httpStatus', String(run.httpStatus ?? '')],
      ['summary', 'responseMs', String(run.responseMs ?? '')],
    ];

    for (const metric of metrics) {
      rows.push(['metric', metric.key, String(metric.valueNum ?? metric.valueText ?? '')]);
    }

    for (const page of pages) {
      rows.push(['page', page.url, `${page.statusCode ?? ''} / ${page.responseMs ?? ''}ms`]);
    }

    for (const issue of issues) {
      rows.push(['issue', issue.issueCode, issue.message]);
    }

    for (const action of actions) {
      rows.push(['action', action.issueCode, action.recommendedAction]);
    }

    for (const inspection of inspections) {
      rows.push(['indexability', inspection.url, inspection.indexabilityStatus]);
    }

    return { headers: ['section', 'key', 'value'], rows };
  }
}
