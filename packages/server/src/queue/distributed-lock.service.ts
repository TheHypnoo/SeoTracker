import { Inject, Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';

import { REDIS_CONNECTION } from './queue.constants';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

const MAX_CONSECUTIVE_REFRESH_FAILURES = 2;

interface LockHandle {
  key: string;
  token: string;
  ttlMs: number;
}

/**
 * Redis-backed distributed lock used to serialise tasks across multiple replicas
 * (typically the scheduler tick). Built on `SET NX PX` for atomic acquire and Lua
 * scripts for atomic compare-and-{extend,release}.
 *
 * Each handle carries a unique token; only the owner of the token can extend or
 * release the lock, which prevents a stale process from clobbering a fresh holder.
 *
 * `withLock` keeps the lock alive in the background. If two consecutive refreshes
 * fail (the key is gone or owned by someone else), the lock is considered lost
 * and the in-flight task is aborted via `AbortSignal` so it stops promptly
 * instead of running unprotected.
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(@Inject(REDIS_CONNECTION) private readonly redis: IORedis) {}

  /**
   * Run `fn` while holding the lock, refreshing the TTL in the background. Returns
   * `null` if the lock is currently held by another process. `fn` receives an
   * `AbortSignal` that fires if the lock is lost mid-execution.
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle) {
      return null;
    }

    const controller = new AbortController();
    const refreshIntervalMs = Math.max(1000, Math.floor(ttlMs / 3));
    let consecutiveFailures = 0;
    let aborted = false;
    let refreshTimer: NodeJS.Timeout | null = null;

    const scheduleNextRefresh = () => {
      refreshTimer = setTimeout(runRefresh, refreshIntervalMs);
      refreshTimer.unref();
    };

    const runRefresh = async () => {
      let ok = false;
      try {
        ok = await this.extend(handle);
      } catch (error) {
        this.logger.warn(`Failed to refresh distributed lock "${handle.key}": ${String(error)}`);
      }

      if (ok) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        this.logger.warn(
          `Distributed lock "${handle.key}" refresh did not extend (consecutive=${consecutiveFailures})`,
        );
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_REFRESH_FAILURES && !aborted) {
        aborted = true;
        this.logger.error(
          `Distributed lock "${handle.key}" appears lost after ${consecutiveFailures} failed refreshes; aborting in-flight task`,
        );
        controller.abort(new Error(`distributed-lock:lost:${handle.key}`));
        return;
      }

      if (!aborted) {
        scheduleNextRefresh();
      }
    };

    scheduleNextRefresh();

    try {
      return await fn(controller.signal);
    } finally {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      await this.release(handle);
    }
  }

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const namespacedKey = this.toNamespacedKey(key);
    const token = randomUUID();

    const result = await this.redis.set(namespacedKey, token, 'PX', ttlMs, 'NX');
    if (result !== 'OK') {
      return null;
    }

    return {
      key: namespacedKey,
      token,
      ttlMs,
    };
  }

  async extend(handle: LockHandle): Promise<boolean> {
    const result = await this.redis.eval(
      EXTEND_LOCK_SCRIPT,
      1,
      handle.key,
      handle.token,
      String(handle.ttlMs),
    );

    return Number(result) === 1;
  }

  async release(handle: LockHandle): Promise<boolean> {
    const result = await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, handle.key, handle.token);

    return Number(result) === 1;
  }

  private toNamespacedKey(key: string) {
    return `seotracker:lock:${key}`;
  }
}
