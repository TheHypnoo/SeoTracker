import { describe, expect, it } from '@jest/globals';
import * as envConfig from './env.schema';

const VALID_SECRET = 'a'.repeat(48);

const BASE_ENV = {
  DATABASE_URL: 'postgres://localhost/seotracker',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: VALID_SECRET,
  JWT_REFRESH_SECRET: VALID_SECRET,
};

describe('apiEnvSchema', () => {
  it('parses a minimal valid environment with sensible defaults', () => {
    const env = envConfig.apiEnvSchema.parse(BASE_ENV);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.CSRF_COOKIE_NAME).toBe('csrf_token');
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('rejects placeholder JWT secrets from .env.example', () => {
    expect(() =>
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        JWT_ACCESS_SECRET: `__replace_me__${'x'.repeat(40)}`,
      }),
    ).toThrow(/JWT_ACCESS_SECRET still uses the placeholder value/);
    expect(() =>
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        JWT_REFRESH_SECRET: `change-this-secret${'x'.repeat(40)}`,
      }),
    ).toThrow(/JWT_REFRESH_SECRET still uses the placeholder value/);
  });

  it('rejects JWT secrets shorter than 32 chars', () => {
    expect(() =>
      envConfig.apiEnvSchema.parse({ ...BASE_ENV, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 chars/);
  });

  it('coerces numeric env vars from strings', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      PORT: '5000',
      AUDIT_CONCURRENCY_GLOBAL: '8',
    });
    expect(env.PORT).toBe(5000);
    expect(env.AUDIT_CONCURRENCY_GLOBAL).toBe(8);
  });

  it('coerces COOKIE_SECURE from "true"/"false" strings', () => {
    const env1 = envConfig.apiEnvSchema.parse({ ...BASE_ENV, COOKIE_SECURE: 'true' });
    expect(env1.COOKIE_SECURE).toBe(true);

    const env2 = envConfig.apiEnvSchema.parse({ ...BASE_ENV, COOKIE_SECURE: 'false' });
    expect(env2.COOKIE_SECURE).toBe(false);
  });

  it('rejects COOKIE_SECURE=false in production but allows it elsewhere', () => {
    expect(() =>
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE must be true in production/);

    expect(
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
      }).COOKIE_SECURE,
    ).toBe(true);

    // Non-production is unaffected.
    expect(
      envConfig.apiEnvSchema.parse({ ...BASE_ENV, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => envConfig.apiEnvSchema.parse({ ...BASE_ENV, DATABASE_URL: 'not-a-url' })).toThrow(
      /Invalid URL/,
    );
  });

  it('rejects JWT_REFRESH_TTL_DAYS above the 90-day cap', () => {
    expect(() =>
      envConfig.apiEnvSchema.parse({ ...BASE_ENV, JWT_REFRESH_TTL_DAYS: '120' }),
    ).toThrow(/Too big/);
    expect(
      envConfig.apiEnvSchema.parse({ ...BASE_ENV, JWT_REFRESH_TTL_DAYS: '90' })
        .JWT_REFRESH_TTL_DAYS,
    ).toBe(90);
  });

  it('rejects AUDIT_MAX_DEPTH outside [1, 3]', () => {
    expect(() => envConfig.apiEnvSchema.parse({ ...BASE_ENV, AUDIT_MAX_DEPTH: '5' })).toThrow(
      /Too big/,
    );
    expect(() => envConfig.apiEnvSchema.parse({ ...BASE_ENV, AUDIT_MAX_DEPTH: '0' })).toThrow(
      /Too small/,
    );
  });

  it('oTEL_ENABLED is false by default and accepts "true" string', () => {
    expect(envConfig.apiEnvSchema.parse(BASE_ENV).OTEL_ENABLED).toBe(false);
    expect(envConfig.apiEnvSchema.parse({ ...BASE_ENV, OTEL_ENABLED: 'true' }).OTEL_ENABLED).toBe(
      true,
    );
  });

  it('aLERT_WEBHOOK_URL is optional but rejects malformed URLs', () => {
    expect(envConfig.apiEnvSchema.parse(BASE_ENV).ALERT_WEBHOOK_URL).toBeUndefined();
    expect(() =>
      envConfig.apiEnvSchema.parse({ ...BASE_ENV, ALERT_WEBHOOK_URL: 'not-a-url' }),
    ).toThrow(/Invalid URL/);
  });

  it('coerces SMTP_SECURE and OTEL_ENABLED from booleans and strings', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      COOKIE_SECURE: true,
      OTEL_ENABLED: false,
      SMTP_SECURE: false,
    });

    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.OTEL_ENABLED).toBe(false);
  });

  it('normalizes empty optional webhook and metrics env vars', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      ALERT_WEBHOOK_URL: '',
      METRICS_TOKEN: '',
    });

    expect(env.ALERT_WEBHOOK_URL).toBeUndefined();
    expect(env.METRICS_TOKEN).toBeUndefined();
  });

  it('accepts configured optional metrics and alert values', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      ALERT_WEBHOOK_URL: 'https://alerts.example.test/hook',
      METRICS_TOKEN: '1234567890abcdef',
    });

    expect(env.ALERT_WEBHOOK_URL).toBe('https://alerts.example.test/hook');
    expect(env.METRICS_TOKEN).toBe('1234567890abcdef');
  });
});

describe('workerEnvSchema', () => {
  it('parses a minimal valid environment with worker defaults', () => {
    const env = envConfig.workerEnvSchema.parse(BASE_ENV);
    expect(env.JOBS_HTTP_PORT).toBe(4101);
    expect(env.SCHEDULER_HTTP_PORT).toBe(4102);
    expect(env.SCHEDULER_LOCK_KEY).toBe('scheduler:run-due-schedules');
    expect(env.SCHEDULER_LOCK_TTL_MS).toBe(90_000);
    expect(env.SCHEDULER_DUE_WINDOW_MINUTES).toBe(5);
  });

  // Regression guard for the production bug where envSchema was shared between
  // both services: @nestjs/config writes validate() output back into
  // process.env, so a `PORT` key in the worker schema would inject PORT=4000
  // into the worker process and silently override JOBS_HTTP_PORT (the worker
  // would then collide with the API on port 4000).
  it.each([
    'PORT',
    'CSRF_COOKIE_NAME',
    'REFRESH_COOKIE_NAME',
    'TRUST_PROXY',
    'WEBHOOK_MAX_SKEW_SECONDS',
    'PASSWORD_RESET_TTL_MINUTES',
  ])('does not expose API-only field %s (regression: worker must not bind PORT=4000)', (key) => {
    const env = envConfig.workerEnvSchema.parse(BASE_ENV) as Record<string, unknown>;
    expect(env[key]).toBeUndefined();
  });

  it('reuses the placeholder + length JWT validations from the common schema', () => {
    expect(() =>
      envConfig.workerEnvSchema.parse({
        ...BASE_ENV,
        JWT_ACCESS_SECRET: `__replace_me__${'x'.repeat(40)}`,
      }),
    ).toThrow(/JWT_ACCESS_SECRET still uses the placeholder value/);
    expect(() =>
      envConfig.workerEnvSchema.parse({ ...BASE_ENV, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 chars/);
  });
});

describe('commonEnvSchema', () => {
  it('omits service-specific fields (no PORT, no JOBS_HTTP_PORT)', () => {
    const env = envConfig.commonEnvSchema.parse(BASE_ENV) as Record<string, unknown>;
    expect(env.PORT).toBeUndefined();
    expect(env.JOBS_HTTP_PORT).toBeUndefined();
  });
});
