import { z } from 'zod';

const PLACEHOLDER_SECRET_PREFIXES = ['change-this', '__replace_me__', 'replace-me'];

function isPlaceholderSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return PLACEHOLDER_SECRET_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.length === 0 ? undefined : value;

// Fields shared between the API and the worker. Keep this list tight — anything
// only one service needs belongs in apiEnvSchema or workerEnvSchema so the
// other service does not validate it (and so ConfigModule does not reinject
// the schema default into process.env in a process that should never see it).
const commonShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  PG_POOL_MAX: z.coerce.number().int().positive().default(20),
  PG_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  PG_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),
  REDIS_URL: z.url(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars (use `openssl rand -base64 48`)')
    .refine((value) => !isPlaceholderSecret(value), {
      message: 'JWT_ACCESS_SECRET still uses the placeholder value from .env.example',
    }),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars (use `openssl rand -base64 48`)')
    .refine((value) => !isPlaceholderSecret(value), {
      message: 'JWT_REFRESH_SECRET still uses the placeholder value from .env.example',
    }),
  JWT_ACCESS_TTL: z.string().default('15m'),
  // Upper bound chosen to keep a stolen refresh token's usability window
  // bounded even if it leaks. Anything longer should be reviewed.
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        return value === 'true';
      }
      return value;
    }, z.boolean())
    .default(false),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .preprocess((value) => (typeof value === 'string' ? value === 'true' : value), z.boolean())
    .default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('SEOTracker <no-reply@seotracker.local>'),
  APP_URL: z.url().default('http://localhost:3000'),
  AUDIT_CONCURRENCY_GLOBAL: z.coerce.number().int().positive().default(4),
  AUDIT_CONCURRENCY_PER_PROJECT: z.coerce.number().int().positive().default(1),
  AUDIT_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(3),
  EXPORT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  EXPORT_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OUTBOUND_CONCURRENCY: z.coerce.number().int().positive().default(5),
  OUTBOUND_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EMAIL_CONCURRENCY: z.coerce.number().int().positive().default(3),
  EMAIL_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(5),
  GSC_IMPORT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  GSC_IMPORT_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // How many months back the one-off backfill pulls when a property is linked.
  // Google retains ~16 months of Search Console data.
  GSC_BACKFILL_MONTHS: z.coerce.number().int().positive().max(16).default(16),
  AUDIT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AUDIT_MAX_LINKS: z.coerce.number().int().positive().default(20),
  AUDIT_MAX_PAGES: z.coerce.number().int().positive().default(12),
  AUDIT_MAX_DEPTH: z.coerce.number().int().min(1).max(3).default(2),
  AUDIT_SITEMAP_SAMPLE_MAX: z.coerce.number().int().positive().default(50),
  // How many <a href> links to keep per page during depth-1 discovery and how
  // many sitemap documents to fetch in a single audit. Both caps prevent a
  // single hostile site from blowing up the crawl frontier.
  AUDIT_MAX_LINKS_PER_PAGE: z.coerce.number().int().positive().default(40),
  AUDIT_MAX_SITEMAPS_PER_RUN: z.coerce.number().int().positive().default(8),
  // User-Agent string sent on every outbound fetch. Identify the crawler with
  // a real, resolvable contact URL so site operators can opt out or reach us.
  AUDIT_USER_AGENT: z
    .string()
    .default('SEOTrackerBot/1.0 (+https://github.com/TheHypnoo/SeoTracker)'),
  EXPORT_STORAGE_DIR: z.string().default('./storage/exports'),
  EXPORT_TTL_HOURS: z.coerce.number().int().positive().default(48),
  // process.env always serialises to a string, so an unset variable in the
  // .env file (e.g. `METRICS_TOKEN=`) arrives as '' rather than undefined.
  // Coerce empty strings to undefined so the optional chain reads them as
  // "not configured" instead of failing the .min(16) check.
  METRICS_TOKEN: z.preprocess(
    (value) => (typeof value === 'string' && value.length === 0 ? undefined : value),
    z.string().min(16).optional(),
  ),
  ALERT_WEBHOOK_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.length === 0 ? undefined : value),
    z.url().optional(),
  ),
  ALERT_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ALERT_WEBHOOK_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  BULLMQ_METRICS_INTERVAL_MS: z.coerce.number().int().nonnegative().default(15_000),
  OTEL_ENABLED: z
    .preprocess((value) => (typeof value === 'string' ? value === 'true' : value), z.boolean())
    .default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.preprocess(emptyStringToUndefined, z.string().min(32).optional()),
  // Shared by API (OAuth flow) and worker (token refresh during scheduled GSC imports),
  // so they live in the common shape rather than apiEnvSchema.
  GOOGLE_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(emptyStringToUndefined, z.url().optional()),
} as const;

export const commonEnvSchema = z.object(commonShape);
export type CommonEnv = z.infer<typeof commonEnvSchema>;

// API-only fields. The worker must NOT validate these — @nestjs/config writes
// validate() output back into process.env, so listing PORT here would inject
// PORT=4000 into the worker process and break its JOBS_HTTP_PORT fallback.
export const apiEnvSchema = z
  .object({
    ...commonShape,
    PORT: z.coerce.number().int().positive().default(4000),
    CSRF_COOKIE_NAME: z.string().default('csrf_token'),
    REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
    WEBHOOK_MAX_SKEW_SECONDS: z.coerce.number().int().positive().default(300),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    // Number of trusted proxy hops in front of the API. Express uses this to
    // resolve req.ip / req.protocol from X-Forwarded-* headers. Set to the
    // exact number — never `true`, since a spoofed X-Forwarded-For would let
    // attackers bypass IP-based rate limiting.
    //  - Local dev:            0 (no proxy)
    //  - Railway only:         1
    //  - Railway + Cloudflare: 2
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  })
  // Fail closed in production: a forgotten COOKIE_SECURE=true would let the
  // HttpOnly refresh cookie travel over plain HTTP and be sniffed on the wire.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        message:
          'COOKIE_SECURE must be true in production so the refresh-token cookie is never sent over plain HTTP',
        path: ['COOKIE_SECURE'],
      });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

// Worker-only fields. Likewise, the API must not validate these.
export const workerEnvSchema = z.object({
  ...commonShape,
  JOBS_HTTP_PORT: z.coerce.number().int().positive().default(4101),
  SCHEDULER_HTTP_PORT: z.coerce.number().int().positive().default(4102),
  SCHEDULER_LOCK_KEY: z.string().default('scheduler:run-due-schedules'),
  SCHEDULER_LOCK_TTL_MS: z.coerce.number().int().positive().default(90_000),
  SCHEDULER_DUE_WINDOW_MINUTES: z.coerce.number().int().positive().default(5),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

// Convenience union used by `packages/server` modules that are reused by both
// services: any key from either schema is accessible in TypeScript. At runtime
// each process only ever exposes the keys validated by its own schema.
export type Env = ApiEnv & WorkerEnv;
