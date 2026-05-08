import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditActionItems } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class ActionPlanCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.ACTION_PLAN;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.auditRunId) {
      throw new BadRequestException('Action plan export requires an auditRunId');
    }

    const actions = await this.db
      .select()
      .from(auditActionItems)
      .where(eq(auditActionItems.auditRunId, exportRecord.auditRunId));

    return {
      headers: [
        'actionId',
        'issueCode',
        'category',
        'severity',
        'priorityScore',
        'impact',
        'effort',
        'scoreImpactPoints',
        'occurrences',
        'affectedPagesCount',
        'affectedPages',
        'evidenceSummary',
        'priorityReason',
        'recommendedAction',
        'remediationPrompt',
        'createdAt',
      ],
      rows: actions.map((action) => [
        action.id,
        action.issueCode,
        action.category,
        action.severity,
        action.priorityScore,
        action.impact,
        action.effort,
        action.scoreImpactPoints,
        action.occurrences,
        action.affectedPagesCount,
        action.affectedPages.join('\n'),
        action.evidenceSummary,
        action.priorityReason,
        action.recommendedAction,
        action.remediationPrompt,
        action.createdAt.toISOString(),
      ]),
    };
  }
}
