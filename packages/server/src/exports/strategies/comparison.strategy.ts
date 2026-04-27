import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditComparisonChanges, auditComparisons } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class ComparisonCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.COMPARISON;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.comparisonId) {
      throw new BadRequestException('Comparison export requires a comparisonId');
    }

    const [comparison, changes] = await Promise.all([
      this.db
        .select()
        .from(auditComparisons)
        .where(eq(auditComparisons.id, exportRecord.comparisonId))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(auditComparisonChanges)
        .where(eq(auditComparisonChanges.comparisonId, exportRecord.comparisonId)),
    ]);

    if (!comparison) {
      throw new NotFoundException('Comparison not found');
    }

    return {
      headers: [
        'comparisonId',
        'changeType',
        'issueCode',
        'category',
        'severity',
        'title',
        'delta',
        'createdAt',
      ],
      rows: changes.map((change) => [
        comparison.id,
        change.changeType,
        change.issueCode ?? '',
        change.issueCategory ?? '',
        change.severity ?? '',
        change.title,
        change.delta ?? '',
        change.createdAt.toISOString(),
      ]),
    };
  }
}
