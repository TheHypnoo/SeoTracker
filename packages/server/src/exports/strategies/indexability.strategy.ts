import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ExportKind } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { Db } from '../../database/database.types';
import { auditUrlInspections } from '../../database/schema';
import type { CsvBuilderStrategy, CsvData, ExportRecord } from './csv-strategy.interface';

@Injectable()
export class IndexabilityCsvStrategy implements CsvBuilderStrategy {
  readonly kind = ExportKind.INDEXABILITY;

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async build(exportRecord: ExportRecord): Promise<CsvData> {
    if (!exportRecord.auditRunId) {
      throw new BadRequestException('Indexability export requires an auditRunId');
    }

    const inspections = await this.db
      .select()
      .from(auditUrlInspections)
      .where(eq(auditUrlInspections.auditRunId, exportRecord.auditRunId));

    return {
      headers: [
        'inspectionId',
        'url',
        'source',
        'statusCode',
        'indexabilityStatus',
        'canonicalUrl',
        'robotsDirective',
        'xRobotsTag',
        'sitemapIncluded',
        'evidence',
        'createdAt',
      ],
      rows: inspections.map((inspection) => [
        inspection.id,
        inspection.url,
        inspection.source,
        inspection.statusCode ?? '',
        inspection.indexabilityStatus,
        inspection.canonicalUrl ?? '',
        inspection.robotsDirective ?? '',
        inspection.xRobotsTag ?? '',
        inspection.sitemapIncluded ? 'yes' : 'no',
        JSON.stringify(inspection.evidence ?? {}),
        inspection.createdAt.toISOString(),
      ]),
    };
  }
}
