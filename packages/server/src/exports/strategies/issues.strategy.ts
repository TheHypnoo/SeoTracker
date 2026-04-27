import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditIssues } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class IssuesCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.ISSUES;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.auditRunId) {
      throw new BadRequestException('Issues export requires an auditRunId');
    }

    const issues = await this.db
      .select()
      .from(auditIssues)
      .where(eq(auditIssues.auditRunId, exportRecord.auditRunId));

    return {
      headers: [
        'issueId',
        'issueCode',
        'category',
        'severity',
        'message',
        'resourceUrl',
        'createdAt',
      ],
      rows: issues.map((issue) => [
        issue.id,
        issue.issueCode,
        issue.category,
        issue.severity,
        issue.message,
        issue.resourceUrl ?? '',
        issue.createdAt.toISOString(),
      ]),
    };
  }
}
