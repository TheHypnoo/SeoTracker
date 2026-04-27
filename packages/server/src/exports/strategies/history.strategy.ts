import { Inject, Injectable } from '@nestjs/common';
import { AuditStatus, AuditTrigger, ExportKind } from '@seotracker/shared-types';
import { desc, eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditRuns } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class HistoryCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.HISTORY;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    const filters = (exportRecord.filters ?? {}) as { status?: string; trigger?: string };

    const runs = await this.db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.siteId, exportRecord.siteId))
      .orderBy(desc(auditRuns.createdAt));

    const visibleRuns = runs.filter((run) => {
      if (filters.status && run.status !== (filters.status as AuditStatus)) return false;
      if (filters.trigger && run.trigger !== (filters.trigger as AuditTrigger)) return false;
      return true;
    });

    return {
      headers: [
        'auditId',
        'trigger',
        'status',
        'score',
        'httpStatus',
        'responseMs',
        'createdAt',
        'finishedAt',
      ],
      rows: visibleRuns.map((run) => [
        run.id,
        run.trigger,
        run.status,
        run.score ?? '',
        run.httpStatus ?? '',
        run.responseMs ?? '',
        run.createdAt.toISOString(),
        run.finishedAt?.toISOString() ?? '',
      ]),
    };
  }
}
