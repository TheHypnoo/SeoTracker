import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { LogLevel } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { SystemLogsService } from './system-logs.service';

type DbMock = {
  insert: jest.Mock;
  values: jest.Mock;
};

function makeDb(): DbMock {
  return {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SystemLogsService', () => {
  let service: SystemLogsService;
  let db: DbMock;

  beforeEach(async () => {
    db = makeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [SystemLogsService, { provide: DRIZZLE, useValue: db }],
    }).compile();
    service = moduleRef.get(SystemLogsService);
  });

  describe('create', () => {
    it('persists with all fields, normalizing context to validated jsonb', async () => {
      await service.create({
        level: LogLevel.INFO,
        source: 'AuditService',
        message: 'started',
        context: { runId: 'r1' },
        auditRunId: 'r1',
        trace: 'stack-trace',
      });

      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          source: 'AuditService',
          message: 'started',
          auditRunId: 'r1',
          trace: 'stack-trace',
          context: expect.any(Object),
        }),
      );
    });

    it('coerces missing auditRunId to null (DB column is nullable)', async () => {
      await service.create({
        level: LogLevel.WARN,
        source: 'X',
        message: 'no run id',
      });

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ auditRunId: null }));
    });

    it('swallows DB errors so a logging failure cannot abort the caller', async () => {
      db.values.mockRejectedValueOnce(new Error('db down'));

      // Must NOT throw — logging is best-effort.
      await expect(
        service.create({ level: LogLevel.ERROR, source: 'X', message: 'x' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('error / warn / info wrappers', () => {
    it('error: extracts stack from Error instance into trace', async () => {
      const err = new Error('boom');
      await service.error('Source', 'failed', err, { foo: 1 }, 'r1');

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          source: 'Source',
          message: 'failed',
          auditRunId: 'r1',
          trace: err.stack,
        }),
      );
    });

    it('error: passes through string error as the trace', async () => {
      await service.error('Source', 'failed', 'just a string');

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ trace: 'just a string' }));
    });

    it('error: undefined error → trace undefined', async () => {
      await service.error('Source', 'failed');

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ trace: undefined }));
    });

    it('warn: persists at WARN level with no trace field', async () => {
      await service.warn('Source', 'careful', { foo: 1 });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.WARN,
          source: 'Source',
          message: 'careful',
        }),
      );
    });

    it('info: persists at INFO level', async () => {
      await service.info('Source', 'fyi');

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.INFO, message: 'fyi' }),
      );
    });
  });
});
