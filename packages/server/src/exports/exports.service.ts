import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExportFormat,
  ExportKind,
  ExportStatus,
  type PaginatedResponse,
  Permission,
} from '@seotracker/shared-types';
import { stringify as csvStringifyStream } from 'csv-stringify';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import type { PaginationInput } from '../common/dto/pagination.dto';
import { assertPresent } from '../common/utils/assert';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditExportFiltersSchema } from '../database/jsonb-schemas';
import { auditComparisons, auditExports, auditRuns, sites } from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { SitesService } from '../sites/sites.service';
import { QueueService } from '../queue/queue.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { CSV_BUILDER_STRATEGIES, type CsvBuilderStrategy, type CsvData } from './strategies';

const DEFAULT_EXPORT_PAGINATION: PaginationInput = { limit: 50, offset: 0 };

@Injectable()
export class ExportsService {
  /** Built once at construction; index → fast O(1) dispatch by kind. */
  private readonly strategiesByKind: ReadonlyMap<ExportKind, CsvBuilderStrategy>;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly sitesService: SitesService,
    private readonly projectsService: ProjectsService,
    private readonly queueService: QueueService,
    private readonly systemLogsService: SystemLogsService,
    @Inject(CSV_BUILDER_STRATEGIES) strategies: CsvBuilderStrategy[],
  ) {
    this.strategiesByKind = new Map(strategies.map((s) => [s.kind, s]));
  }

  async create(
    siteId: string,
    userId: string,
    input: {
      kind: ExportKind;
      format: ExportFormat;
      auditRunId?: string;
      comparisonId?: string;
      filters?: Record<string, unknown>;
    },
  ) {
    await this.sitesService.getByIdWithPermission(siteId, userId, Permission.EXPORT_CREATE);

    if (input.format !== ExportFormat.CSV) {
      throw new BadRequestException('Only CSV exports are currently available');
    }

    await this.validateScope(siteId, input);

    const [created] = await this.db
      .insert(auditExports)
      .values({
        requestedByUserId: userId,
        siteId,
        auditRunId: input.auditRunId ?? null,
        comparisonId: input.comparisonId ?? null,
        kind: input.kind,
        format: input.format,
        status: ExportStatus.PENDING,
        filters: auditExportFiltersSchema.parse(input.filters ?? {}),
      })
      .returning();

    const savedExport = assertPresent(created, 'Export creation did not return a row');

    await this.queueService.enqueueExport({ exportId: savedExport.id });
    return savedExport;
  }

  /**
   * Cross-site export listing for a whole project. Joins `audit_exports` with `sites` so the
   * filter is a single SQL roundtrip; permission is enforced at project level.
   */
  async listForProjectScope(
    projectId: string,
    userId: string,
    pagination: PaginationInput = DEFAULT_EXPORT_PAGINATION,
  ): Promise<PaginatedResponse<typeof auditExports.$inferSelect>> {
    await this.projectsService.assertPermission(projectId, userId, Permission.EXPORT_READ);

    const { limit, offset } = pagination;
    const projectFilter = eq(sites.projectId, projectId);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditExports)
      .innerJoin(sites, eq(sites.id, auditExports.siteId))
      .where(projectFilter);

    const items = await this.db
      .select({ export: auditExports })
      .from(auditExports)
      .innerJoin(sites, eq(sites.id, auditExports.siteId))
      .where(projectFilter)
      .orderBy(desc(auditExports.createdAt))
      .limit(limit)
      .offset(offset);

    return { items: items.map((row) => row.export), total: Number(total ?? 0), limit, offset };
  }

  /**
   * Re-enqueue a FAILED (or stuck PENDING/PROCESSING) export. The job runs through the regular
   * processor, which re-builds the file from scratch — exports are deterministic given the same
   * filters, so re-running is safe.
   */
  async retry(exportId: string, userId: string) {
    const exportRecord = await this.getById(exportId, userId);

    await this.sitesService.getByIdWithPermission(
      exportRecord.siteId,
      userId,
      Permission.EXPORT_CREATE,
    );

    if (
      exportRecord.status !== ExportStatus.FAILED &&
      exportRecord.status !== ExportStatus.EXPIRED
    ) {
      throw new BadRequestException('Only failed or expired exports can be retried');
    }

    await this.db
      .update(auditExports)
      .set({
        status: ExportStatus.PENDING,
        completedAt: null,
        expiresAt: null,
        fileName: null,
        storagePath: null,
      })
      .where(eq(auditExports.id, exportId));

    await this.queueService.enqueueExport(
      { exportId },
      { jobId: `${exportId}:retry:${Date.now()}` },
    );

    return { id: exportId, status: ExportStatus.PENDING };
  }

  /**
   * Reaper for exports stuck in PENDING/PROCESSING beyond `staleAfterMs` (default: 15 min).
   * Re-enqueues them so a worker that died mid-job does not leave the user staring at a
   * "processing" spinner forever. Errors per export go to systemLogs and do not abort the loop.
   */
  async reconcilePendingExports(options: { limit?: number; staleAfterMs?: number } = {}) {
    const staleBefore = new Date(Date.now() - (options.staleAfterMs ?? 15 * 60_000));
    const candidates = await this.db
      .select({
        id: auditExports.id,
        kind: auditExports.kind,
        siteId: auditExports.siteId,
        status: auditExports.status,
      })
      .from(auditExports)
      .where(
        and(
          inArray(auditExports.status, [ExportStatus.PENDING, ExportStatus.PROCESSING]),
          lt(auditExports.createdAt, staleBefore),
        ),
      )
      .limit(options.limit ?? 50);

    let requeued = 0;
    for (const exportRecord of candidates) {
      try {
        if (exportRecord.status === ExportStatus.PROCESSING) {
          await this.db
            .update(auditExports)
            .set({ status: ExportStatus.PENDING, completedAt: null })
            .where(eq(auditExports.id, exportRecord.id));
        }
        await this.queueService.enqueueExport(
          { exportId: exportRecord.id },
          { jobId: `${exportRecord.id}:reconcile:${Date.now()}` },
        );
        requeued += 1;
      } catch (error) {
        await this.systemLogsService.error(
          ExportsService.name,
          'Pending export could not be reconciled',
          error,
          {
            exportId: exportRecord.id,
            kind: exportRecord.kind,
            siteId: exportRecord.siteId,
            status: exportRecord.status,
          },
        );
      }
    }

    return { requeued };
  }

  async listForProject(
    siteId: string,
    userId: string,
    pagination: PaginationInput = DEFAULT_EXPORT_PAGINATION,
  ): Promise<PaginatedResponse<typeof auditExports.$inferSelect>> {
    await this.sitesService.getByIdWithPermission(siteId, userId, Permission.EXPORT_READ);

    const { limit, offset } = pagination;

    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditExports)
      .where(eq(auditExports.siteId, siteId));
    const total = Number(totalRows[0]?.total ?? 0);

    const items = await this.db
      .select()
      .from(auditExports)
      .where(eq(auditExports.siteId, siteId))
      .orderBy(desc(auditExports.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total, limit, offset };
  }

  async getById(exportId: string, userId: string) {
    const [exportRecord] = await this.db
      .select()
      .from(auditExports)
      .where(eq(auditExports.id, exportId))
      .limit(1);
    if (!exportRecord) {
      throw new NotFoundException('Export not found');
    }

    await this.sitesService.getByIdWithPermission(
      exportRecord.siteId,
      userId,
      Permission.EXPORT_READ,
    );
    return exportRecord;
  }

  async resolveDownload(exportId: string, userId: string) {
    const exportRecord = await this.getById(exportId, userId);

    if (
      exportRecord.status !== ExportStatus.COMPLETED ||
      !exportRecord.storagePath ||
      !exportRecord.fileName
    ) {
      throw new BadRequestException('Export is not ready');
    }

    if (exportRecord.expiresAt && exportRecord.expiresAt < new Date()) {
      throw new BadRequestException('Export has expired');
    }

    await stat(exportRecord.storagePath);

    return {
      fileName: exportRecord.fileName,
      storagePath: exportRecord.storagePath,
    };
  }

  async processQueuedExport(exportId: string) {
    if (!UUID_V4_RE.test(exportId)) {
      await this.systemLogsService.warn(
        ExportsService.name,
        'Rejected processQueuedExport with non-UUID exportId',
        { exportId },
      );
      return;
    }

    const [exportRecord] = await this.db
      .select()
      .from(auditExports)
      .where(eq(auditExports.id, exportId))
      .limit(1);
    if (!exportRecord) {
      return;
    }

    if (
      exportRecord.status === ExportStatus.COMPLETED ||
      exportRecord.status === ExportStatus.EXPIRED
    ) {
      return;
    }

    try {
      await this.db
        .update(auditExports)
        .set({
          status: ExportStatus.PROCESSING,
        })
        .where(eq(auditExports.id, exportId));

      const csvData = await this.buildCsv(exportRecord);
      const storageDir = path.resolve(
        this.configService.get('EXPORT_STORAGE_DIR', { infer: true }),
      );
      const exportDir = path.join(storageDir, exportId);
      await mkdir(exportDir, { recursive: true });

      const fileName = `${exportRecord.kind.toLowerCase()}-${exportId}.csv`;
      const storagePath = path.join(exportDir, fileName);
      await this.writeCsv(storagePath, csvData);

      const expiresAt = new Date(
        Date.now() + this.configService.get('EXPORT_TTL_HOURS', { infer: true }) * 60 * 60 * 1000,
      );

      await this.db
        .update(auditExports)
        .set({
          status: ExportStatus.COMPLETED,
          fileName,
          storagePath,
          expiresAt,
          completedAt: new Date(),
        })
        .where(eq(auditExports.id, exportId));

      await this.systemLogsService.info(ExportsService.name, 'Export generated successfully', {
        exportId,
        kind: exportRecord.kind,
        siteId: exportRecord.siteId,
      });
    } catch (error) {
      await this.db
        .update(auditExports)
        .set({
          status: ExportStatus.FAILED,
        })
        .where(eq(auditExports.id, exportId));

      await this.systemLogsService.error(ExportsService.name, 'Export generation failed', error, {
        exportId,
        kind: exportRecord.kind,
        siteId: exportRecord.siteId,
      });
    }
  }

  private writeCsv(storagePath: string, data: CsvData) {
    const stringifier = csvStringifyStream({ header: true, columns: data.headers });
    const writeStream = createWriteStream(storagePath, { encoding: 'utf-8' });
    for (const row of data.rows) {
      stringifier.write(row);
    }
    stringifier.end();
    return pipeline(stringifier, writeStream);
  }

  private async validateScope(
    siteId: string,
    input: {
      kind: ExportKind;
      auditRunId?: string;
      comparisonId?: string;
    },
  ) {
    const auditScopedKinds = [
      ExportKind.AUDIT_RESULT,
      ExportKind.ISSUES,
      ExportKind.METRICS,
      ExportKind.ACTION_PLAN,
      ExportKind.INDEXABILITY,
    ];
    if (auditScopedKinds.includes(input.kind) && !input.auditRunId) {
      throw new BadRequestException('auditRunId is required for this export kind');
    }

    if (input.kind === ExportKind.COMPARISON && !input.comparisonId) {
      throw new BadRequestException('comparisonId is required for comparison exports');
    }

    if (input.auditRunId) {
      const [run] = await this.db
        .select({ id: auditRuns.id })
        .from(auditRuns)
        .where(and(eq(auditRuns.id, input.auditRunId), eq(auditRuns.siteId, siteId)))
        .limit(1);

      if (!run) {
        throw new BadRequestException('Audit run not found in site');
      }
    }

    if (input.comparisonId) {
      const [comparison] = await this.db
        .select({ id: auditComparisons.id })
        .from(auditComparisons)
        .where(
          and(eq(auditComparisons.id, input.comparisonId), eq(auditComparisons.siteId, siteId)),
        )
        .limit(1);

      if (!comparison) {
        throw new BadRequestException('Comparison not found in site');
      }
    }
  }

  private async buildCsv(exportRecord: typeof auditExports.$inferSelect): Promise<CsvData> {
    const strategy = this.strategiesByKind.get(exportRecord.kind);
    if (!strategy) {
      throw new BadRequestException('Unsupported export kind');
    }
    return strategy.build(exportRecord);
  }
}
