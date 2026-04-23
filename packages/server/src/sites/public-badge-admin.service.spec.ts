import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Permission } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { PublicBadgesService } from '../public-badges/public-badges.service';
import { PublicBadgeAdminService } from './public-badge-admin.service';
import { SitesService } from './sites.service';

describe('PublicBadgeAdminService', () => {
  let service: PublicBadgeAdminService;
  let db: { update: jest.Mock; set: jest.Mock; where: jest.Mock };
  let sites: { getByIdWithPermission: jest.Mock };
  let publicBadges: { invalidate: jest.Mock };
  let emit: jest.Mock;

  beforeEach(async () => {
    db = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    sites = {
      getByIdWithPermission: jest.fn().mockResolvedValue({
        id: 's1',
        projectId: 'p1',
        publicBadgeEnabled: false,
      }),
    };
    publicBadges = { invalidate: jest.fn().mockResolvedValue(undefined) };
    emit = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicBadgeAdminService,
        { provide: DRIZZLE, useValue: db },
        { provide: SitesService, useValue: sites },
        { provide: PublicBadgesService, useValue: publicBadges },
        { provide: EventEmitter2, useValue: { emit, emitAsync: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PublicBadgeAdminService);
  });

  describe('getForUser', () => {
    it('asserts SCHEDULE_READ permission and returns the enabled flag', async () => {
      sites.getByIdWithPermission.mockResolvedValueOnce({
        id: 's1',
        projectId: 'p1',
        publicBadgeEnabled: true,
      });
      const out = await service.getForUser('s1', 'u1');
      expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
        's1',
        'u1',
        Permission.SCHEDULE_READ,
      );
      expect(out.enabled).toBe(true);
    });
  });

  describe('update', () => {
    it('asserts SCHEDULE_WRITE, persists, invalidates cache and emits activity (enable)', async () => {
      const out = await service.update('s1', 'u1', { enabled: true });

      expect(sites.getByIdWithPermission).toHaveBeenCalledWith(
        's1',
        'u1',
        Permission.SCHEDULE_WRITE,
      );
      expect(db.set).toHaveBeenCalledWith(expect.objectContaining({ publicBadgeEnabled: true }));
      expect(publicBadges.invalidate).toHaveBeenCalledWith('s1');
      expect(emit).toHaveBeenCalledWith(
        'activity.recorded',
        expect.objectContaining({
          action: 'public_badge.toggled',
          projectId: 'p1',
          siteId: 's1',
          metadata: { enabled: true },
        }),
      );
      expect(out.enabled).toBe(true);
    });

    it('handles disabling (enabled=false) the same way', async () => {
      await service.update('s1', 'u1', { enabled: false });
      expect(db.set).toHaveBeenCalledWith(expect.objectContaining({ publicBadgeEnabled: false }));
      expect(publicBadges.invalidate).toHaveBeenCalledWith('s1');
      expect(emit).toHaveBeenCalledWith(
        'activity.recorded',
        expect.objectContaining({ metadata: { enabled: false } }),
      );
    });

    it('throws when permission check fails (no persist, no emit, no invalidate)', async () => {
      sites.getByIdWithPermission.mockRejectedValueOnce(new Error('forbidden'));
      await expect(service.update('s1', 'u1', { enabled: true })).rejects.toThrow('forbidden');
      expect(db.set).not.toHaveBeenCalled();
      expect(publicBadges.invalidate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('records the actor userId on the activity event', async () => {
      await service.update('s1', 'user-42', { enabled: true });
      expect(emit).toHaveBeenCalledWith(
        'activity.recorded',
        expect.objectContaining({ userId: 'user-42' }),
      );
    });
  });
});
