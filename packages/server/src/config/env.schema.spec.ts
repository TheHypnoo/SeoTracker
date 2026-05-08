import { envSchema } from './env.schema';

const VALID_SECRET = 'a'.repeat(48);

const BASE_ENV = {
  DATABASE_URL: 'postgres://localhost/seotracker',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: VALID_SECRET,
  JWT_REFRESH_SECRET: VALID_SECRET,
};

describe('envSchema', () => {
  it('parses a minimal valid environment with sensible defaults', () => {
    const env = envSchema.parse(BASE_ENV);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.PG_POOL_MAX).toBe(20);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.AUDIT_CONCURRENCY_GLOBAL).toBe(4);
  });

  it('rejects placeholder JWT secrets from .env.example', () => {
    expect(() =>
      envSchema.parse({ ...BASE_ENV, JWT_ACCESS_SECRET: '__replace_me__' + 'x'.repeat(40) }),
    ).toThrow(/JWT_ACCESS_SECRET still uses the placeholder value/);
    expect(() =>
      envSchema.parse({ ...BASE_ENV, JWT_REFRESH_SECRET: 'change-this-secret' + 'x'.repeat(40) }),
    ).toThrow(/JWT_REFRESH_SECRET still uses the placeholder value/);
  });

  it('rejects JWT secrets shorter than 32 chars', () => {
    expect(() => envSchema.parse({ ...BASE_ENV, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /JWT_ACCESS_SECRET must be at least 32 chars/,
    );
  });

  it('coerces numeric env vars from strings', () => {
    const env = envSchema.parse({
      ...BASE_ENV,
      PORT: '5000',
      AUDIT_CONCURRENCY_GLOBAL: '8',
    });
    expect(env.PORT).toBe(5000);
    expect(env.AUDIT_CONCURRENCY_GLOBAL).toBe(8);
  });

  it('coerces COOKIE_SECURE from "true"/"false" strings', () => {
    const env1 = envSchema.parse({ ...BASE_ENV, COOKIE_SECURE: 'true' });
    expect(env1.COOKIE_SECURE).toBe(true);

    const env2 = envSchema.parse({ ...BASE_ENV, COOKIE_SECURE: 'false' });
    expect(env2.COOKIE_SECURE).toBe(false);
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => envSchema.parse({ ...BASE_ENV, DATABASE_URL: 'not-a-url' })).toThrow(
      /Invalid URL/,
    );
  });

  it('rejects AUDIT_MAX_DEPTH outside [1, 3]', () => {
    expect(() => envSchema.parse({ ...BASE_ENV, AUDIT_MAX_DEPTH: '5' })).toThrow(/Too big/);
    expect(() => envSchema.parse({ ...BASE_ENV, AUDIT_MAX_DEPTH: '0' })).toThrow(/Too small/);
  });

  it('TRUST_PROXY defaults to 0 (no proxy)', () => {
    const env = envSchema.parse(BASE_ENV);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('OTEL_ENABLED is false by default and accepts "true" string', () => {
    expect(envSchema.parse(BASE_ENV).OTEL_ENABLED).toBe(false);
    expect(envSchema.parse({ ...BASE_ENV, OTEL_ENABLED: 'true' }).OTEL_ENABLED).toBe(true);
  });

  it('ALERT_WEBHOOK_URL is optional but rejects malformed URLs', () => {
    expect(envSchema.parse(BASE_ENV).ALERT_WEBHOOK_URL).toBeUndefined();
    expect(() => envSchema.parse({ ...BASE_ENV, ALERT_WEBHOOK_URL: 'not-a-url' })).toThrow(
      /Invalid URL/,
    );
  });
});
