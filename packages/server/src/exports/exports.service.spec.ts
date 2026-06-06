import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExportFormat, ExportKind, ExportStatus, Permission } from '@seotracker/shared-types';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ExportsService, sanitizeCsvCell } from './exports.service';

const VALID_EXPORT_ID = '11111111-1111-4111-8111-111111111111';

describe('sanitizeCsvCell', () => {
  it('prefixes cells that start with a formula trigger', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
    expect(sanitizeCsvCell('+cmd')).toBe("'+cmd");
    expect(sanitizeCsvCell('-2')).toBe("'-2");
    expect(sanitizeCsvCell('@x')).toBe('@x'.replace('@', "'@"));
  });

  it('leaves numbers, empty strings and benign text untouched', () => {
    expect(sanitizeCsvCell(42)).toBe(42);
    expect(sanitizeCsvCell('')).toBe('');
    expect(sanitizeCsvCell('Example')).toBe('Example');
  });
});

function selectRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            offset: jest.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

function selectDirectRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(rows),
    }),
  };
}

function insertRows(rows: unknown[]) {
  return {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(rows),
    }),
  };
}

function updateChain() {
  return {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(db: Record<string, jest.Mock>) {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        EXPORT_STORAGE_DIR: '/tmp/seotracker-test-exports',
        EXPORT_TTL_HOURS: 48,
      };
      return values[key];
    }),
  };
  const sitesService = { getByIdWithPermission: jest.fn() };
  const projectsService = { assertPermission: jest.fn() };
  const queueService = { enqueueExport: jest.fn() };
  const systemLogsService = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const strategy = {
    build: jest.fn().mockResolvedValue({
      headers: ['Name'],
      rows: [{ Name: 'Example' }],
    }),
    kind: ExportKind.HISTORY,
  };

  const service = new ExportsService(
    db as never,
    configService as never,
    sitesService as never,
    projectsService as never,
    queueService as never,
    systemLogsService as never,
    [strategy] as never,
  );

  return {
    configService,
    projectsService,
    queueService,
    service,
    sitesService,
    strategy,
    systemLogsService,
  };
}

describe('exportsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a pending CSV export and enqueues it', async () => {
    const created = {
      format: ExportFormat.CSV,
      id: VALID_EXPORT_ID,
      kind: ExportKind.HISTORY,
      siteId: 'site-1',
      status: ExportStatus.PENDING,
    };
    const db = {
      insert: jest.fn().mockReturnValue(insertRows([created])),
    };
    const { queueService, service, sitesService } = makeService(db);

    await expect(
      service.create('site-1', 'user-1', {
        filters: { status: 'open' },
        format: ExportFormat.CSV,
        kind: ExportKind.HISTORY,
      }),
    ).resolves.toBe(created);

    expect(sitesService.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.EXPORT_CREATE,
    );
    expect(queueService.enqueueExport).toHaveBeenCalledWith({ exportId: VALID_EXPORT_ID });
  });

  it('rejects unsupported formats and missing scoped ids', async () => {
    const db = { insert: jest.fn(), select: jest.fn() };
    const { service } = makeService(db);

    await expect(
      service.create('site-1', 'user-1', {
        format: ExportFormat.JSON,
        kind: ExportKind.HISTORY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('site-1', 'user-1', {
        format: ExportFormat.CSV,
        kind: ExportKind.AUDIT_RESULT,
      }),
    ).rejects.toThrow('auditRunId is required');

    await expect(
      service.create('site-1', 'user-1', {
        format: ExportFormat.CSV,
        kind: ExportKind.ACTION_PLAN,
      }),
    ).rejects.toThrow('auditRunId is required');

    await expect(
      service.create('site-1', 'user-1', {
        format: ExportFormat.CSV,
        kind: ExportKind.INDEXABILITY,
      }),
    ).rejects.toThrow('auditRunId is required');

    await expect(
      service.create('site-1', 'user-1', {
        format: ExportFormat.CSV,
        kind: ExportKind.COMPARISON,
      }),
    ).rejects.toThrow('comparisonId is required');
  });

  it('lists project-scope exports after checking project permission', async () => {
    const exportRecord = { id: 'export-1' };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectDirectRows([{ total: 1 }]))
        .mockReturnValueOnce(selectRows([{ export: exportRecord }])),
    };
    const { projectsService, service } = makeService(db);

    await expect(
      service.listForProjectScope('project-1', 'user-1', { limit: 10, offset: 5 }),
    ).resolves.toStrictEqual({
      items: [exportRecord],
      limit: 10,
      offset: 5,
      total: 1,
    });
    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.EXPORT_READ,
    );
  });

  it('lists project-scope exports with default pagination and total fallback', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectDirectRows([{ total: undefined }]))
        .mockReturnValueOnce(selectRows([])),
    };
    const { service } = makeService(db);

    await expect(service.listForProjectScope('project-1', 'user-1')).resolves.toStrictEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
  });

  it('lists project-scope exports when the total query returns no row', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectDirectRows([]))
        .mockReturnValueOnce(selectRows([])),
    };
    const { service } = makeService(db);

    await expect(service.listForProjectScope('project-1', 'user-1')).resolves.toMatchObject({
      total: 0,
    });
  });

  it('lists site exports after checking read permission', async () => {
    const items = [{ id: 'export-1' }, { id: 'export-2' }];
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectDirectRows([{ total: 2 }]))
        .mockReturnValueOnce(selectRows(items)),
    };
    const { service, sitesService } = makeService(db);

    await expect(
      service.listForProject('site-1', 'user-1', { limit: 20, offset: 10 }),
    ).resolves.toStrictEqual({
      items,
      limit: 20,
      offset: 10,
      total: 2,
    });
    expect(sitesService.getByIdWithPermission).toHaveBeenCalledWith(
      'site-1',
      'user-1',
      Permission.EXPORT_READ,
    );
  });

  it('lists site exports with default pagination and total fallback', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectDirectRows([]))
        .mockReturnValueOnce(selectRows([])),
    };
    const { service } = makeService(db);

    await expect(service.listForProject('site-1', 'user-1')).resolves.toStrictEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
  });

  it('throws when an export cannot be found by id', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(selectRows([])),
    };
    const { service } = makeService(db);

    await expect(service.getById(VALID_EXPORT_ID, 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolves a ready, non-expired download to its stored path', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'seotracker-export-'));
    const storagePath = path.join(dir, 'history.csv');
    let resolved: Awaited<ReturnType<ExportsService['resolveDownload']>>;

    try {
      await writeFile(storagePath, 'Name\nExample\n', 'utf-8');
      const db = {
        select: jest.fn().mockReturnValueOnce(
          selectRows([
            {
              fileName: 'history.csv',
              id: VALID_EXPORT_ID,
              siteId: 'site-1',
              status: ExportStatus.COMPLETED,
              storagePath,
              expiresAt: new Date(Date.now() + 60_000),
            },
          ]),
        ),
      };
      const { service } = makeService(db);
      resolved = await service.resolveDownload(VALID_EXPORT_ID, 'user-1');
    } finally {
      await rm(dir, { force: true, recursive: true });
    }

    expect(resolved).toStrictEqual({
      fileName: 'history.csv',
      storagePath,
    });
  });

  it('rejects downloads that are not ready or already expired', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          selectRows([
            {
              fileName: null,
              id: VALID_EXPORT_ID,
              siteId: 'site-1',
              status: ExportStatus.PENDING,
              storagePath: null,
            },
          ]),
        )
        .mockReturnValueOnce(
          selectRows([
            {
              fileName: 'history.csv',
              id: VALID_EXPORT_ID,
              siteId: 'site-1',
              status: ExportStatus.COMPLETED,
              storagePath: '/tmp/no-read-needed.csv',
              expiresAt: new Date(Date.now() - 60_000),
            },
          ]),
        ),
    };
    const { service } = makeService(db);

    await expect(service.resolveDownload(VALID_EXPORT_ID, 'user-1')).rejects.toThrow(
      'Export is not ready',
    );
    await expect(service.resolveDownload(VALID_EXPORT_ID, 'user-1')).rejects.toThrow(
      'Export has expired',
    );
  });

  it('retries failed exports by resetting persisted file fields and enqueueing a unique job', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        selectRows([
          {
            id: VALID_EXPORT_ID,
            siteId: 'site-1',
            status: ExportStatus.FAILED,
          },
        ]),
      ),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { queueService, service } = makeService(db);

    await expect(service.retry(VALID_EXPORT_ID, 'user-1')).resolves.toStrictEqual({
      id: VALID_EXPORT_ID,
      status: ExportStatus.PENDING,
    });
    expect(queueService.enqueueExport).toHaveBeenCalledWith(
      { exportId: VALID_EXPORT_ID },
      { jobId: expect.stringContaining(`${VALID_EXPORT_ID}:retry:`) },
    );
  });

  it('rejects retries for exports that are not failed or expired', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        selectRows([
          {
            id: VALID_EXPORT_ID,
            siteId: 'site-1',
            status: ExportStatus.COMPLETED,
          },
        ]),
      ),
    };
    const { service } = makeService(db);

    await expect(service.retry(VALID_EXPORT_ID, 'user-1')).rejects.toThrow(
      'Only failed or expired exports can be retried',
    );
  });

  it('reconciles stale pending and processing exports without aborting on one enqueue failure', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        selectRows([
          {
            id: 'pending-1',
            kind: ExportKind.HISTORY,
            siteId: 'site-1',
            status: ExportStatus.PENDING,
          },
          {
            id: 'processing-1',
            kind: ExportKind.HISTORY,
            siteId: 'site-1',
            status: ExportStatus.PROCESSING,
          },
        ]),
      ),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { queueService, service, systemLogsService } = makeService(db);
    queueService.enqueueExport
      .mockRejectedValueOnce(new Error('queue down'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.reconcilePendingExports({ limit: 2, staleAfterMs: 1000 }),
    ).resolves.toStrictEqual({
      requeued: 1,
    });
    expect(systemLogsService.error).toHaveBeenCalledWith(
      ExportsService.name,
      'Pending export could not be reconciled',
      expect.any(Error),
      expect.objectContaining({ exportId: 'pending-1' }),
    );
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('reconciles with default options when no overrides are supplied', async () => {
    const db = {
      select: jest.fn().mockReturnValueOnce(
        selectRows([
          {
            id: 'pending-1',
            kind: ExportKind.HISTORY,
            siteId: 'site-1',
            status: ExportStatus.PENDING,
          },
        ]),
      ),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { queueService, service } = makeService(db);
    queueService.enqueueExport.mockResolvedValueOnce(undefined);

    await expect(service.reconcilePendingExports()).resolves.toStrictEqual({ requeued: 1 });
    expect(queueService.enqueueExport).toHaveBeenCalledWith(
      { exportId: 'pending-1' },
      { jobId: expect.stringContaining('pending-1:reconcile:') },
    );
  });

  it('processes queued exports and persists generated file metadata', async () => {
    const exportRecord = {
      id: VALID_EXPORT_ID,
      kind: ExportKind.HISTORY,
      siteId: 'site-1',
      status: ExportStatus.PENDING,
    };
    const db = {
      select: jest.fn().mockReturnValueOnce(selectRows([exportRecord])),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { service, systemLogsService } = makeService(db);
    jest.spyOn(service as never, 'writeCsv').mockResolvedValue(undefined);

    await service.processQueuedExport(VALID_EXPORT_ID);

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(systemLogsService.info).toHaveBeenCalledWith(
      ExportsService.name,
      'Export generated successfully',
      expect.objectContaining({ exportId: VALID_EXPORT_ID }),
    );
  });

  it('skips queued exports that are missing or already terminal', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectRows([]))
        .mockReturnValueOnce(
          selectRows([
            {
              id: VALID_EXPORT_ID,
              kind: ExportKind.HISTORY,
              siteId: 'site-1',
              status: ExportStatus.COMPLETED,
            },
          ]),
        ),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { service } = makeService(db);

    await service.processQueuedExport(VALID_EXPORT_ID);
    await service.processQueuedExport(VALID_EXPORT_ID);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects malformed queued export ids and marks generation failures', async () => {
    const exportRecord = {
      id: VALID_EXPORT_ID,
      kind: ExportKind.HISTORY,
      siteId: 'site-1',
      status: ExportStatus.PENDING,
    };
    const db = {
      select: jest.fn().mockReturnValueOnce(selectRows([exportRecord])),
      update: jest.fn().mockReturnValue(updateChain()),
    };
    const { service, systemLogsService, strategy } = makeService(db);

    await service.processQueuedExport('not-a-uuid');
    strategy.build.mockRejectedValueOnce(new Error('build failed'));
    await service.processQueuedExport(VALID_EXPORT_ID);

    expect(systemLogsService.warn).toHaveBeenCalledWith(
      ExportsService.name,
      'Rejected processQueuedExport with non-UUID exportId',
      { exportId: 'not-a-uuid' },
    );
    expect(systemLogsService.error).toHaveBeenCalledWith(
      ExportsService.name,
      'Export generation failed',
      expect.any(Error),
      expect.objectContaining({ exportId: VALID_EXPORT_ID }),
    );
  });

  it('rejects scoped exports when the audit run is outside the site', async () => {
    const db = {
      insert: jest.fn(),
      select: jest.fn().mockReturnValueOnce(selectRows([])),
    };
    const { service } = makeService(db);

    await expect(
      service.create('site-1', 'user-1', {
        auditRunId: 'foreign-run',
        format: ExportFormat.CSV,
        kind: ExportKind.METRICS,
      }),
    ).rejects.toThrow('Audit run not found in site');
  });

  it('writes CSV files through the private stream helper', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'seotracker-csv-'));
    const storagePath = path.join(dir, 'export.csv');
    const db = {};
    const { service } = makeService(db as never);

    let content = '';
    try {
      await (
        service as unknown as { writeCsv: (path: string, data: unknown) => Promise<void> }
      ).writeCsv(storagePath, { headers: ['Name'], rows: [['Example']] });
      content = await readFile(storagePath, 'utf-8');
    } finally {
      await rm(dir, { force: true, recursive: true });
    }

    expect(content).toContain('Name\nExample');
  });

  it('neutralizes CSV formula-injection cells when writing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'seotracker-csv-'));
    const storagePath = path.join(dir, 'export.csv');
    const { service } = makeService({} as never);

    let content = '';
    try {
      await (
        service as unknown as { writeCsv: (path: string, data: unknown) => Promise<void> }
      ).writeCsv(storagePath, {
        headers: ['Title'],
        rows: [['=HYPERLINK("http://evil","x")'], ['Safe title']],
      });
      content = await readFile(storagePath, 'utf-8');
    } finally {
      await rm(dir, { force: true, recursive: true });
    }

    // The formula cell is prefixed with a single quote; benign cells untouched.
    expect(content).toContain(`'=HYPERLINK`);
    expect(content).toContain('Safe title');
  });

  it('rejects unsupported export kinds when no CSV strategy is registered', async () => {
    const service = new ExportsService(
      {} as never,
      { get: jest.fn() } as never,
      { getByIdWithPermission: jest.fn() } as never,
      { assertPermission: jest.fn() } as never,
      { enqueueExport: jest.fn() } as never,
      { error: jest.fn(), info: jest.fn(), warn: jest.fn() } as never,
      [] as never,
    );

    await expect(
      (service as unknown as { buildCsv: (record: unknown) => Promise<unknown> }).buildCsv({
        kind: ExportKind.HISTORY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates audit run and comparison scope before creating scoped exports', async () => {
    const created = {
      format: ExportFormat.CSV,
      id: VALID_EXPORT_ID,
      kind: ExportKind.COMPARISON,
      siteId: 'site-1',
      status: ExportStatus.PENDING,
    };
    const db = {
      insert: jest.fn().mockReturnValue(insertRows([created])),
      select: jest
        .fn()
        .mockReturnValueOnce(selectRows([{ id: 'run-1' }]))
        .mockReturnValueOnce(selectRows([]))
        .mockReturnValueOnce(selectRows([{ id: 'cmp-1' }])),
    };
    const { queueService, service } = makeService(db);

    await expect(
      service.create('site-1', 'user-1', {
        auditRunId: 'run-1',
        format: ExportFormat.CSV,
        kind: ExportKind.AUDIT_RESULT,
      }),
    ).resolves.toMatchObject({ id: VALID_EXPORT_ID });
    await expect(
      service.create('site-1', 'user-1', {
        comparisonId: 'foreign-comparison',
        format: ExportFormat.CSV,
        kind: ExportKind.COMPARISON,
      }),
    ).rejects.toThrow('Comparison not found in site');
    await expect(
      service.create('site-1', 'user-1', {
        comparisonId: 'cmp-1',
        format: ExportFormat.CSV,
        kind: ExportKind.COMPARISON,
      }),
    ).resolves.toMatchObject({ id: VALID_EXPORT_ID });
    expect(queueService.enqueueExport).toHaveBeenCalledTimes(2);
  });
});
