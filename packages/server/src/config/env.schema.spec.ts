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
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_OAUTH_REDIRECT_URI: '',
      GOOGLE_TOKEN_ENCRYPTION_KEY: '',
      METRICS_TOKEN: '',
    });

    expect(env.ALERT_WEBHOOK_URL).toBeUndefined();
    expect(env.METRICS_TOKEN).toBeUndefined();
  });

  it('normalizes empty optional Google OAuth env vars', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_OAUTH_REDIRECT_URI: '',
      GOOGLE_TOKEN_ENCRYPTION_KEY: '',
    });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBeUndefined();
    expect(env.GOOGLE_TOKEN_ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts configured optional metrics and alert values', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      ALERT_WEBHOOK_URL: 'https://alerts.example.test/hook',
      GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/api/v1/google/oauth/callback',
      GOOGLE_TOKEN_ENCRYPTION_KEY: 'g'.repeat(32),
      METRICS_TOKEN: '1234567890abcdef',
    });

    expect(env.ALERT_WEBHOOK_URL).toBe('https://alerts.example.test/hook');
    expect(env.METRICS_TOKEN).toBe('1234567890abcdef');
  });

  it('accepts configured optional Google OAuth values', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/api/v1/google/oauth/callback',
      GOOGLE_TOKEN_ENCRYPTION_KEY: 'g'.repeat(32),
    });

    expect(env.GOOGLE_CLIENT_ID).toBe('google-client-id.apps.googleusercontent.com');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('google-client-secret');
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBe(
      'https://api.example.test/api/v1/google/oauth/callback',
    );
    expect(env.GOOGLE_TOKEN_ENCRYPTION_KEY).toBe('g'.repeat(32));
  });

  it('rejects malformed Google OAuth configuration values when provided', () => {
    expect(() =>
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        GOOGLE_OAUTH_REDIRECT_URI: 'not-a-url',
      }),
    ).toThrow(/Invalid URL/);
    expect(() =>
      envConfig.apiEnvSchema.parse({
        ...BASE_ENV,
        GOOGLE_TOKEN_ENCRYPTION_KEY: 'too-short',
      }),
    ).toThrow(/Too small/);
  });

  it('defaults the storage driver to fs and needs no S3 credentials', () => {
    const env = envConfig.apiEnvSchema.parse(BASE_ENV);
    expect(env.STORAGE_DRIVER).toBe('fs');
    expect(env.STORAGE_FS_DIR).toBe('../../storage');
    expect(env.STORAGE_S3_REGION).toBe('auto');
    expect(env.STORAGE_S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('coerces STORAGE_S3_FORCE_PATH_STYLE from a "true" string', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      STORAGE_S3_FORCE_PATH_STYLE: 'true',
    });
    expect(env.STORAGE_S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('requires bucket and credentials when STORAGE_DRIVER=s3', () => {
    expect(() => envConfig.apiEnvSchema.parse({ ...BASE_ENV, STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_S3_BUCKET is required when STORAGE_DRIVER=s3/,
    );
  });

  it('accepts a fully configured S3 driver', () => {
    const env = envConfig.apiEnvSchema.parse({
      ...BASE_ENV,
      STORAGE_DRIVER: 's3',
      STORAGE_S3_BUCKET: 'seotracker-exports',
      STORAGE_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
      STORAGE_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    });
    expect(env.STORAGE_DRIVER).toBe('s3');
    expect(env.STORAGE_S3_BUCKET).toBe('seotracker-exports');
    expect(env.STORAGE_S3_ENDPOINT).toBe('https://account.r2.cloudflarestorage.com');
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
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
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

  it('enforces the S3 driver credential check just like the API schema', () => {
    expect(() => envConfig.workerEnvSchema.parse({ ...BASE_ENV, STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_S3_BUCKET is required when STORAGE_DRIVER=s3/,
    );
  });
});

describe('commonEnvSchema', () => {
  it('omits service-specific fields (no PORT, no JOBS_HTTP_PORT)', () => {
    const env = envConfig.commonEnvSchema.parse(BASE_ENV) as Record<string, unknown>;
    expect(env.PORT).toBeUndefined();
    expect(env.JOBS_HTTP_PORT).toBeUndefined();
  });
});
