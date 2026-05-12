import { describe, expect, it, jest } from '@jest/globals';
import { ScheduleFrequency } from '@seotracker/shared-types';
import { DateTime } from 'luxon';

import { isScheduleDue, SchedulingService } from './scheduling.service';

function makeDb(schedules: Array<Record<string, unknown>> = []) {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(schedules),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: updateWhere,
      }),
    }),
    updateWhere,
  };
}

function makeService(db = makeDb()) {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        SCHEDULER_DUE_WINDOW_MINUTES: 5,
        SCHEDULER_LOCK_KEY: 'scheduler',
        SCHEDULER_LOCK_TTL_MS: 90_000,
      };
      return values[key];
    }),
  };
  const auditsService = { reconcileQueuedRuns: jest.fn(), runScheduled: jest.fn() };
  const distributedLockService = {
    withLock: jest.fn((_key: string, _ttl: number, fn: (signal: AbortSignal) => Promise<void>) =>
      fn(new AbortController().signal),
    ),
  };
  const systemLogsService = { error: jest.fn() };
  const notificationsService = {
    reconcilePendingEmailDeliveries: jest.fn().mockResolvedValue({ reconciled: 0 }),
  };
  const exportsService = { reconcilePendingExports: jest.fn().mockResolvedValue({ requeued: 0 }) };
  const outboundWebhooksService = {
    reconcilePendingDeliveries: jest.fn().mockResolvedValue({ requeued: 0 }),
  };
  const service = new SchedulingService(
    db as never,
    configService as never,
    auditsService as never,
    distributedLockService as never,
    systemLogsService as never,
    notificationsService as never,
    exportsService as never,
    outboundWebhooksService as never,
  );

  return {
    auditsService,
    configService,
    db,
    distributedLockService,
    exportsService,
    notificationsService,
    outboundWebhooksService,
    service,
    systemLogsService,
  };
}

describe('isScheduleDue', () => {
  const nowUtc = DateTime.fromISO('2026-05-08T10:03:00.000Z', { zone: 'utc' });

  it('accepts daily schedules inside the due window and rejects already-run schedules', () => {
    const schedule = {
      dayOfWeek: null,
      frequency: ScheduleFrequency.DAILY,
      lastRunAt: null,
      timeOfDay: '10:00',
      timezone: 'utc',
    };

    expect(isScheduleDue(schedule, nowUtc, 5)).toBe(true);
    expect(
      isScheduleDue({ ...schedule, lastRunAt: new Date('2026-05-08T10:01:00.000Z') }, nowUtc, 5),
    ).toBe(false);
  });

  it('rejects invalid times, future windows and mismatched weekly days', () => {
    const schedule = {
      dayOfWeek: 6,
      frequency: ScheduleFrequency.WEEKLY,
      lastRunAt: null,
      timeOfDay: '10:00',
      timezone: 'utc',
    };

    expect(isScheduleDue({ ...schedule, timeOfDay: 'bad' }, nowUtc, 5)).toBe(false);
    expect(isScheduleDue({ ...schedule, timeOfDay: '10:10' }, nowUtc, 5)).toBe(false);
    expect(isScheduleDue({ ...schedule, dayOfWeek: 1 }, nowUtc, 5)).toBe(false);
  });
});

describe('schedulingService', () => {
  it('runs due schedules under a distributed lock and stores lastRunAt', async () => {
    const db = makeDb([
      {
        dayOfWeek: null,
        frequency: ScheduleFrequency.DAILY,
        id: 'schedule-1',
        lastRunAt: null,
        siteId: 'site-1',
        timeOfDay: DateTime.now().toUTC().toFormat('HH:mm'),
        timezone: 'utc',
      },
    ]);
    const { auditsService, distributedLockService, service } = makeService(db);

    await service.runDueSchedules();

    expect(distributedLockService.withLock).toHaveBeenCalledWith(
      'scheduler',
      90_000,
      expect.any(Function),
    );
    expect(auditsService.runScheduled).toHaveBeenCalledWith('site-1');
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('logs schedule execution errors and keeps the scheduler tick alive', async () => {
    const db = makeDb([
      {
        dayOfWeek: null,
        frequency: ScheduleFrequency.DAILY,
        id: 'schedule-1',
        lastRunAt: null,
        siteId: 'site-1',
        timeOfDay: DateTime.now().toUTC().toFormat('HH:mm'),
        timezone: 'utc',
      },
    ]);
    const { auditsService, service, systemLogsService } = makeService(db);
    auditsService.runScheduled.mockRejectedValueOnce(new Error('audit down'));

    await service.runDueSchedules();

    expect(systemLogsService.error).toHaveBeenCalledWith(
      SchedulingService.name,
      'Scheduled audit execution failed',
      expect.any(Error),
      { scheduleId: 'schedule-1', siteId: 'site-1' },
    );
  });

  it('reconciles email deliveries and queued work under separate locks', async () => {
    const {
      auditsService,
      exportsService,
      notificationsService,
      outboundWebhooksService,
      service,
    } = makeService();
    notificationsService.reconcilePendingEmailDeliveries.mockResolvedValueOnce({ reconciled: 2 });
    auditsService.reconcileQueuedRuns.mockResolvedValueOnce({ requeued: 1 });
    exportsService.reconcilePendingExports.mockResolvedValueOnce({ requeued: 1 });
    outboundWebhooksService.reconcilePendingDeliveries.mockResolvedValueOnce({ requeued: 1 });

    await service.reconcileEmailDeliveries();
    await service.reconcileQueuedWork();

    expect(notificationsService.reconcilePendingEmailDeliveries).toHaveBeenCalledTimes(1);
    expect(auditsService.reconcileQueuedRuns).toHaveBeenCalledTimes(1);
    expect(exportsService.reconcilePendingExports).toHaveBeenCalledTimes(1);
    expect(outboundWebhooksService.reconcilePendingDeliveries).toHaveBeenCalledTimes(1);
  });
});
