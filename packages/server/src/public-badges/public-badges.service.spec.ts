import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../database/database.constants';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { PublicBadgesService } from './public-badges.service';

describe('publicBadgesService', () => {
  let service: PublicBadgesService;
  let db: {
    select: jest.Mock;
    from: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
  };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicBadgesService,
        { provide: DRIZZLE, useValue: db },
        { provide: REDIS_CONNECTION, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(PublicBadgesService);
  });

  describe('renderSvg', () => {
    it('returns cached svg without touching the database', async () => {
      redis.get.mockResolvedValueOnce('<svg cached/>');
      const out = await service.renderSvg('s1');
      expect(out.svg).toBe('<svg cached/>');
      expect(db.select).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('returns disabled SVG when site does not exist (no leak)', async () => {
      db.limit.mockResolvedValueOnce([]);
      const out = await service.renderSvg('s-unknown');
      expect(out.svg).toContain('off');
      expect(out.svg).toContain('#475569');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s-unknown',
        expect.any(String),
        'EX',
        60,
      );
    });

    it('still renders from the database when redis read fails', async () => {
      redis.get.mockRejectedValueOnce(new Error('redis read down'));
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 88 }]);

      const out = await service.renderSvg('s1');

      expect(out.svg).toContain('>88/100<');
    });

    it('still returns the svg when redis write fails', async () => {
      redis.set.mockRejectedValueOnce(new Error('redis write down'));
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 91 }]);

      const out = await service.renderSvg('s1');

      expect(out.svg).toContain('>91/100<');
    });

    it('returns disabled SVG when public_badge_enabled = false', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: false, score: null }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('off');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s1',
        expect.any(String),
        'EX',
        60,
      );
    });

    it('returns pending SVG when enabled but no completed audits', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: null }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('pending');
      expect(out.svg).toContain('#64748b');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s1',
        expect.any(String),
        'EX',
        60,
      );
    });

    it('returns green SVG when score >= 80 and caches 5 minutes', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 90 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('SEOTracker');
      expect(out.svg).toContain('width="168"');
      expect(out.svg).toContain('aria-label="SEOTracker score"');
      expect(out.svg).toContain('>90/100<');
      expect(out.svg).toContain('#059669');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s1',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('returns amber SVG when 50 <= score < 80', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 60 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('>60/100<');
      expect(out.svg).toContain('#d97706');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s1',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('returns red SVG when score < 50', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 30 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('>30/100<');
      expect(out.svg).toContain('#dc2626');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:official:svg:s1',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  describe('invalidate', () => {
    it('deletes the current and legacy cache keys for the site', async () => {
      await service.invalidate('s1');
      expect(redis.del).toHaveBeenCalledWith('public-badge:official:svg:s1');
      expect(redis.del).toHaveBeenCalledWith('public-badge:svg:s1');
      expect(redis.del).toHaveBeenCalledWith('public-badge:v2:svg:s1');
    });

    it('does not fail when redis delete fails', async () => {
      redis.del.mockRejectedValueOnce(new Error('redis delete down'));
      await expect(service.invalidate('s1')).resolves.toBeUndefined();
    });
  });
});
