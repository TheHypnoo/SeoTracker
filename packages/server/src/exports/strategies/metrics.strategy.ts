import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditMetrics } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class MetricsCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.METRICS;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.auditRunId) {
      throw new BadRequestException('Metrics export requires an auditRunId');
    }

    const metrics = await this.db
      .select()
      .from(auditMetrics)
      .where(eq(auditMetrics.auditRunId, exportRecord.auditRunId));

    return {
      headers: ['metricId', 'key', 'valueNum', 'valueText', 'createdAt'],
      rows: metrics.map((metric) => [
        metric.id,
        metric.key,
        metric.valueNum ?? '',
        metric.valueText ?? '',
        metric.createdAt.toISOString(),
      ]),
    };
  }
}
