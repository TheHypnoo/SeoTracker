import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { DistributedLockService } from './distributed-lock.service';
import { REDIS_CONNECTION } from './queue.constants';

type RedisMock = {
  set: jest.Mock;
  eval: jest.Mock;
};

function makeRedis(): RedisMock {
  return {
    set: jest.fn(),
    eval: jest.fn(),
  };
}

describe('distributedLockService', () => {
  let service: DistributedLockService;
  let redis: RedisMock;

  beforeEach(async () => {
    redis = makeRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [DistributedLockService, { provide: REDIS_CONNECTION, useValue: redis }],
    }).compile();
    service = moduleRef.get(DistributedLockService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('acquire', () => {
    it('issues a SET key value PX ttl NX with a unique token', async () => {
      redis.set.mockResolvedValueOnce('OK');

      const handle = await service.acquire('scheduler', 60_000);

      expect(redis.set).toHaveBeenCalledWith(
        'seotracker:lock:scheduler',
        expect.any(String),
        'PX',
        60_000,
        'NX',
      );
      expect(handle).toStrictEqual({
        key: 'seotracker:lock:scheduler',
        token: expect.any(String),
        ttlMs: 60_000,
      });
    });

    it('returns null when another holder owns the key (SET returned non-OK)', async () => {
      redis.set.mockResolvedValueOnce(null);

      const handle = await service.acquire('scheduler', 60_000);

      expect(handle).toBeNull();
    });

    it('namespaces keys to avoid collisions with other Redis users', async () => {
      redis.set.mockResolvedValueOnce('OK');
      await service.acquire('foo:bar', 1000);
      const [key] = redis.set.mock.calls[0];
      expect(key).toBe('seotracker:lock:foo:bar');
    });
  });

  describe('extend', () => {
    it('runs the Lua script with token + new TTL and returns true on success', async () => {
      redis.eval.mockResolvedValueOnce(1);

      const ok = await service.extend({
        key: 'seotracker:lock:x',
        token: 'tok-1',
        ttlMs: 10_000,
      });

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        'seotracker:lock:x',
        'tok-1',
        '10000',
      );
      expect(ok).toBe(true);
    });

    it('returns false when the script returns 0 (lock no longer ours)', async () => {
      redis.eval.mockResolvedValueOnce(0);

      const ok = await service.extend({
        key: 'seotracker:lock:x',
        token: 'tok-1',
        ttlMs: 10_000,
      });

      expect(ok).toBe(false);
    });
  });

  describe('release', () => {
    it('runs the Lua DEL script with the token and returns true on success', async () => {
      redis.eval.mockResolvedValueOnce(1);

      const ok = await service.release({
        key: 'seotracker:lock:x',
        token: 'tok-1',
        ttlMs: 1,
      });

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('del'),
        1,
        'seotracker:lock:x',
        'tok-1',
      );
      expect(ok).toBe(true);
    });

    it('returns false when the lock was already gone (DEL returned 0)', async () => {
      redis.eval.mockResolvedValueOnce(0);

      const ok = await service.release({
        key: 'seotracker:lock:x',
        token: 'tok-1',
        ttlMs: 1,
      });

      expect(ok).toBe(false);
    });
  });

  describe('withLock', () => {
    it('returns null without invoking fn when the lock cannot be acquired', async () => {
      redis.set.mockResolvedValueOnce(null); // acquire fails

      const fn = jest.fn();
      const result = await service.withLock('k', 1000, fn);

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('runs fn with an AbortSignal and releases the lock on success', async () => {
      redis.set.mockResolvedValueOnce('OK');
      redis.eval.mockResolvedValueOnce(1); // release

      const fn = jest.fn().mockImplementation((signal: AbortSignal) => {
        // Signal is provided so fn can react if the lock is lost mid-flight.
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        return Promise.resolve('done');
      });

      const result = await service.withLock('k', 60_000, fn);

      expect(result).toBe('done');
      expect(fn).toHaveBeenCalledTimes(1);
      // Lock must be released even on success.
      const releaseCall = redis.eval.mock.calls.find((args) => String(args[0]).includes('del'));
      expect(releaseCall).toBeDefined();
    });

    it('releases the lock even when fn throws', async () => {
      redis.set.mockResolvedValueOnce('OK');
      redis.eval.mockResolvedValueOnce(1); // release script

      const fn = jest.fn().mockRejectedValue(new Error('boom'));

      await expect(service.withLock('k', 60_000, fn)).rejects.toThrow('boom');

      // Even on error, the release script must have run.
      const releaseCall = redis.eval.mock.calls.find((args) => String(args[0]).includes('del'));
      expect(releaseCall).toBeDefined();
    });

    it('aborts the in-flight task after two consecutive failed refreshes', async () => {
      jest.useFakeTimers();
      redis.set.mockResolvedValueOnce('OK');
      redis.eval
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      const result = service.withLock('k', 3000, async (signal) => {
        return new Promise<string>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve(signal.reason instanceof Error ? signal.reason.message : 'aborted');
          });
        });
      });

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      await expect(result).resolves.toBe('distributed-lock:lost:seotracker:lock:k');
      expect(
        redis.eval.mock.calls.filter((args) => String(args[0]).includes('pexpire')),
      ).toHaveLength(2);
      expect(redis.eval.mock.calls.some((args) => String(args[0]).includes('del'))).toBe(true);
    });
  });
});
