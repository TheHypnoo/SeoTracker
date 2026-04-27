import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../database/database.constants';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { PublicBadgesService } from './public-badges.service';

describe('PublicBadgesService', () => {
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
      expect(out.svg).toContain('#94a3b8');
      expect(redis.set).toHaveBeenCalledWith(
        'public-badge:svg:s-unknown',
        expect.any(String),
        'EX',
        60,
      );
    });

    it('returns disabled SVG when public_badge_enabled = false', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: false, score: null }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('off');
      expect(redis.set).toHaveBeenCalledWith('public-badge:svg:s1', expect.any(String), 'EX', 60);
    });

    it('returns pending SVG when enabled but no completed audits', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: null }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('—');
      expect(out.svg).toContain('#94a3b8');
      expect(redis.set).toHaveBeenCalledWith('public-badge:svg:s1', expect.any(String), 'EX', 60);
    });

    it('returns green SVG when score >= 80 and caches 5 minutes', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 90 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('>90<');
      expect(out.svg).toContain('#10b981');
      expect(redis.set).toHaveBeenCalledWith('public-badge:svg:s1', expect.any(String), 'EX', 300);
    });

    it('returns amber SVG when 50 <= score < 80', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 60 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('>60<');
      expect(out.svg).toContain('#f59e0b');
      expect(redis.set).toHaveBeenCalledWith('public-badge:svg:s1', expect.any(String), 'EX', 300);
    });

    it('returns red SVG when score < 50', async () => {
      db.limit.mockResolvedValueOnce([{ enabled: true, score: 30 }]);
      const out = await service.renderSvg('s1');
      expect(out.svg).toContain('>30<');
      expect(out.svg).toContain('#ef4444');
      expect(redis.set).toHaveBeenCalledWith('public-badge:svg:s1', expect.any(String), 'EX', 300);
    });
  });

  describe('invalidate', () => {
    it('deletes the cache key for the site', async () => {
      await service.invalidate('s1');
      expect(redis.del).toHaveBeenCalledWith('public-badge:svg:s1');
    });
  });
});
