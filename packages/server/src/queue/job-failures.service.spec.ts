import { ConfigService } from '@nestjs/config';

import { JobFailuresService } from './job-failures.service';

const insertValues = jest.fn().mockResolvedValue(undefined);
const dbMock = {
  insert: jest.fn().mockReturnValue({ values: insertValues }),
};

const buildConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    get: jest.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        ALERT_WEBHOOK_URL: undefined,
        ALERT_WEBHOOK_MIN_INTERVAL_MS: 0,
        ALERT_WEBHOOK_TIMEOUT_MS: 1000,
      };
      return overrides[key] ?? defaults[key];
    }),
  }) as unknown as ConfigService;

const fetchMock = jest.fn();

describe('JobFailuresService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('persists insert with required fields', async () => {
    const svc = new JobFailuresService(dbMock as never, buildConfig());
    await svc.record({
      queueName: 'q1',
      jobName: 'j',
      attempts: 3,
      payload: { foo: 1 },
      reason: 'boom',
    });
    expect(insertValues).toHaveBeenCalledWith({
      queueName: 'q1',
      jobName: 'j',
      jobId: null,
      attempts: 3,
      payload: { foo: 1 },
      reason: 'boom',
      stack: null,
    });
  });

  it('passes through jobId and stack when supplied', async () => {
    const svc = new JobFailuresService(dbMock as never, buildConfig());
    await svc.record({
      queueName: 'q1',
      jobName: 'j',
      jobId: 'jid-1',
      attempts: 1,
      payload: {},
      reason: 'x',
      stack: 'STACK',
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'jid-1', stack: 'STACK' }),
    );
  });

  it('swallows db errors so the failure path keeps moving', async () => {
    insertValues.mockRejectedValueOnce(new Error('db down'));
    const svc = new JobFailuresService(dbMock as never, buildConfig());
    await expect(
      svc.record({ queueName: 'q', jobName: 'j', attempts: 1, payload: {}, reason: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('does NOT call fetch when ALERT_WEBHOOK_URL is unset', async () => {
    const svc = new JobFailuresService(dbMock as never, buildConfig());
    await svc.record({ queueName: 'q', jobName: 'j', attempts: 1, payload: {}, reason: 'r' });
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dispatches alert webhook with throttle gate', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const svc = new JobFailuresService(
      dbMock as never,
      buildConfig({
        ALERT_WEBHOOK_URL: 'https://hook.test',
        ALERT_WEBHOOK_MIN_INTERVAL_MS: 60_000,
      }),
    );

    await svc.record({ queueName: 'qA', jobName: 'j', attempts: 1, payload: {}, reason: 'r1' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same queue within minInterval → throttled out
    await svc.record({ queueName: 'qA', jobName: 'j', attempts: 1, payload: {}, reason: 'r2' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Different queue → independent throttle
    await svc.record({ queueName: 'qB', jobName: 'j', attempts: 1, payload: {}, reason: 'r3' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not throw when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const svc = new JobFailuresService(
      dbMock as never,
      buildConfig({ ALERT_WEBHOOK_URL: 'https://hook.test' }),
    );
    await expect(
      svc.record({ queueName: 'q', jobName: 'j', attempts: 1, payload: {}, reason: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('logs but does not throw when webhook returns non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    const svc = new JobFailuresService(
      dbMock as never,
      buildConfig({ ALERT_WEBHOOK_URL: 'https://hook.test' }),
    );
    await svc.record({ queueName: 'q', jobName: 'j', attempts: 1, payload: {}, reason: 'x' });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalled();
  });
});

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
