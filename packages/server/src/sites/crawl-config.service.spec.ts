import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Permission } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { CrawlConfigService } from './crawl-config.service';
import { SitesService } from './sites.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

describe('CrawlConfigService', () => {
  let service: CrawlConfigService;
  let db: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    onConflictDoUpdate: jest.Mock;
  };
  let sites: { getByIdWithPermission: jest.Mock };
  let emit: jest.Mock;

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    };
    sites = {
      getByIdWithPermission: jest.fn().mockResolvedValue({ id: 's1', projectId: 'p1' }),
    };
    emit = jest.fn();
    const config = {
      get: jest.fn((key: string) =>
        key === 'AUDIT_MAX_PAGES' ? 50 : key === 'AUDIT_MAX_DEPTH' ? 2 : undefined,
      ),
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CrawlConfigService,
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: SitesService, useValue: sites },
        { provide: EventEmitter2, useValue: { emit, emitAsync: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CrawlConfigService);
  });

  describe('resolve', () => {
    it('returns env defaults when no per-site override exists', async () => {
      db.where.mockReturnValueOnce(thenable([]));
      const out = await service.resolve('s1');
      expect(out.maxPages).toBe(50);
      expect(out.maxDepth).toBe(2);
      expect(out.maxConcurrentPages).toBe(5);
      expect(out.requestDelayMs).toBe(0);
      expect(out.respectCrawlDelay).toBe(true);
      expect(out.userAgent).toBeNull();
    });

    it('falls back to defaults for null fields in the row', async () => {
      db.where.mockReturnValueOnce(
        thenable([
          {
            siteId: 's1',
            maxPages: 100,
            maxDepth: null,
            maxConcurrentPages: null,
            requestDelayMs: null,
            respectCrawlDelay: null,
            userAgent: 'CustomBot/1.0',
          },
        ]),
      );
      const out = await service.resolve('s1');
      expect(out.maxPages).toBe(100); // overridden
      expect(out.maxDepth).toBe(2); // default
      expect(out.maxConcurrentPages).toBe(5); // default
      expect(out.userAgent).toBe('CustomBot/1.0');
    });
  });

  describe('getForUser', () => {
    it('asserts SCHEDULE_READ permission before resolving', async () => {
      db.where.mockReturnValueOnce(thenable([]));
      await service.getForUser('s1', 'u1');
      expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
        's1',
        'u1',
        Permission.SCHEDULE_READ,
      );
    });
  });

  describe('update', () => {
    it('asserts SCHEDULE_WRITE, persists patch and emits activity', async () => {
      db.where.mockReturnValueOnce(thenable([])); // for resolve() after upsert

      await service.update('s1', 'u1', { maxPages: 100, requestDelayMs: 250 });

      expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
        's1',
        'u1',
        Permission.SCHEDULE_WRITE,
      );
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 's1', maxPages: 100, requestDelayMs: 250 }),
      );
      expect(emit).toHaveBeenCalledWith(
        'activity.recorded',
        expect.objectContaining({ action: 'crawl_config.updated', projectId: 'p1' }),
      );
    });

    it('rejects values exceeding hard caps', async () => {
      await expect(service.update('s1', 'u1', { maxPages: 99999 })).rejects.toThrow(
        /maxPages must be an integer in/,
      );
    });

    it('rejects negative values', async () => {
      await expect(service.update('s1', 'u1', { requestDelayMs: -5 })).rejects.toThrow(
        /requestDelayMs must be an integer in/,
      );
    });
  });
});
