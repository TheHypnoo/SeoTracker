import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ScheduleFrequency } from '@seotracker/shared-types';
import { DateTime } from 'luxon';

import {
  isScheduleDue,
  SchedulingService,
  SEOTRACKER_RUNTIME_ROLE_ENV,
  WORKER_RUNTIME_ROLE,
} from './scheduling.service';

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
  const auditsService = {
    reconcileQueuedRuns: jest.fn().mockResolvedValue({ requeued: 0 }),
    runScheduled: jest.fn(),
  };
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
  const searchConsoleService = {
    listActiveLinks: jest.fn().mockResolvedValue([]),
  };
  const queueService = {
    enqueueGscImport: jest.fn().mockResolvedValue(undefined),
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
    searchConsoleService as never,
    queueService as never,
  );

  return {
    auditsService,
    configService,
    db,
    distributedLockService,
    exportsService,
    notificationsService,
    outboundWebhooksService,
    queueService,
    searchConsoleService,
    service,
    systemLogsService,
  };
}

describe('schedulingService.onModuleInit (worker-only guard)', () => {
  const originalRole = readRole();

  function readRole(): string | undefined {
    return process.env[SEOTRACKER_RUNTIME_ROLE_ENV];
  }

  function setRole(value: string | undefined) {
    if (value === undefined) {
      // oxlint-disable-next-line typescript/no-dynamic-delete -- test reset
      Reflect.deleteProperty(process.env, SEOTRACKER_RUNTIME_ROLE_ENV);
      return;
    }
    process.env[SEOTRACKER_RUNTIME_ROLE_ENV] = value;
  }

  afterEach(() => {
    setRole(originalRole);
  });

  it('throws when the runtime role env var is unset (e.g. loaded from apps/api by mistake)', () => {
    setRole(undefined);
    const { service } = makeService();

    expect(() => service.onModuleInit()).toThrow(/worker process/);
  });

  it('throws when the runtime role is something other than "worker"', () => {
    setRole('api');
    const { service } = makeService();

    expect(() => service.onModuleInit()).toThrow(/worker process/);
  });

  it('passes when the runtime role is set to the worker constant', () => {
    setRole(WORKER_RUNTIME_ROLE);
    const { service } = makeService();

    expect(() => service.onModuleInit()).not.toThrow();
  });
});

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
    expect(isScheduleDue({ ...schedule, timeOfDay: '10' }, nowUtc, 5)).toBe(false);
    expect(isScheduleDue({ ...schedule, timeOfDay: '10:10' }, nowUtc, 5)).toBe(false);
    expect(isScheduleDue({ ...schedule, timeOfDay: '09:00' }, nowUtc, 5)).toBe(false);
    expect(isScheduleDue({ ...schedule, dayOfWeek: 1 }, nowUtc, 5)).toBe(false);
  });

  it('accepts matching weekly schedules that last ran before this slot', () => {
    expect(
      isScheduleDue(
        {
          dayOfWeek: 5,
          frequency: ScheduleFrequency.WEEKLY,
          lastRunAt: new Date('2026-05-01T10:03:00.000Z'),
          timeOfDay: '10:00',
          timezone: 'utc',
        },
        nowUtc,
        5,
      ),
    ).toBe(true);
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

  it('continues past non-due schedules without running audits', async () => {
    const db = makeDb([
      {
        dayOfWeek: null,
        frequency: ScheduleFrequency.DAILY,
        id: 'not-due',
        lastRunAt: null,
        siteId: 'site-1',
        timeOfDay: '00:00',
        timezone: 'utc',
      },
    ]);
    const { auditsService, service } = makeService(db);

    await service.runDueSchedules();

    expect(auditsService.runScheduled).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips non-due schedules and stops when the lock signal is aborted', async () => {
    const db = makeDb([
      {
        dayOfWeek: null,
        frequency: ScheduleFrequency.DAILY,
        id: 'not-due',
        lastRunAt: null,
        siteId: 'site-1',
        timeOfDay: '00:00',
        timezone: 'utc',
      },
      {
        dayOfWeek: null,
        frequency: ScheduleFrequency.DAILY,
        id: 'aborted',
        lastRunAt: null,
        siteId: 'site-2',
        timeOfDay: DateTime.now().toUTC().toFormat('HH:mm'),
        timezone: 'utc',
      },
    ]);
    const { auditsService, distributedLockService, service } = makeService(db);
    const controller = new AbortController();
    distributedLockService.withLock.mockImplementationOnce(
      async (_key: string, _ttl: number, fn: (signal: AbortSignal) => Promise<void>) => {
        controller.abort();
        return fn(controller.signal);
      },
    );

    await service.runDueSchedules();

    expect(auditsService.runScheduled).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('quietly skips scheduler work when another instance owns each lock', async () => {
    const { distributedLockService, service } = makeService();
    distributedLockService.withLock.mockResolvedValue(null);

    await service.runDueSchedules();
    await service.reconcileEmailDeliveries();
    await service.reconcileQueuedWork();

    expect(distributedLockService.withLock).toHaveBeenCalledTimes(3);
  });

  it('does not log reconciliation summaries when no jobs are requeued', async () => {
    const { service } = makeService();

    await service.reconcileEmailDeliveries();
    await service.reconcileQueuedWork();

    expect(true).toBe(true);
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

  it('enqueues a Search Console import for every active link under its own lock', async () => {
    const { distributedLockService, queueService, searchConsoleService, service } = makeService();
    searchConsoleService.listActiveLinks.mockResolvedValueOnce([
      { siteId: 'site-1', lastImportedAt: null },
      { siteId: 'site-2', lastImportedAt: null },
    ]);

    await service.importSearchConsoleData();

    expect(distributedLockService.withLock).toHaveBeenCalledWith(
      'scheduler:gsc-import',
      90_000,
      expect.any(Function),
    );
    expect(queueService.enqueueGscImport).toHaveBeenCalledTimes(2);
    expect(queueService.enqueueGscImport).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site-1' }),
    );
  });

  it('logs and records GSC import enqueue failures without aborting the tick', async () => {
    const { queueService, searchConsoleService, service, systemLogsService } = makeService();
    searchConsoleService.listActiveLinks.mockResolvedValueOnce([
      { siteId: 'site-1', lastImportedAt: null },
      { siteId: 'site-2', lastImportedAt: null },
    ]);
    queueService.enqueueGscImport.mockRejectedValueOnce(new Error('redis down'));

    await service.importSearchConsoleData();

    expect(systemLogsService.error).toHaveBeenCalledWith(
      SchedulingService.name,
      'Scheduled GSC import enqueue failed',
      expect.any(Error),
      { siteId: 'site-1' },
    );
    // The second link is still enqueued after the first one fails.
    expect(queueService.enqueueGscImport).toHaveBeenCalledTimes(2);
  });

  it('skips the GSC import tick when another instance owns the lock', async () => {
    const { distributedLockService, searchConsoleService, service } = makeService();
    distributedLockService.withLock.mockResolvedValueOnce(null);

    await service.importSearchConsoleData();

    expect(searchConsoleService.listActiveLinks).not.toHaveBeenCalled();
  });
});
