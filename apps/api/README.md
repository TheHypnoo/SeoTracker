# `apps/api`

NestJS HTTP entrypoint for SEOTracker. Exposes the public REST surface under `/api/v1` and OpenAPI docs at `/docs`.

Most reusable backend code (modules, services, the Drizzle schema, queue bindings) lives in the [`@seotracker/server`](../../packages/server) package and is consumed by both this app and `apps/worker`.

## What it does

- HTTP layer: controllers, validation, throttling, CSRF and Helmet.
- Authentication (`/auth/*`): register, login, refresh-token rotation, password reset, SSR session lookup.
- Domain endpoints: projects, members, invites, sites, schedules, alerts, audits, comparisons, exports, webhooks, notifications.
- Health (`/health/live`, `/health/ready`) and Prometheus metrics (`/metrics`).
- Swagger UI at `/docs` (only when `NODE_ENV !== 'production'`).

## Scripts

```bash
pnpm dev              # nest start --watch
pnpm build
pnpm start            # production build
pnpm test             # jest unit tests
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm db:generate      # drizzle-kit generate (schema → SQL migration)
pnpm db:migrate       # drizzle-kit migrate (apply migrations)
pnpm db:studio        # drizzle-kit studio (web UI to inspect data)
```

## Environment

Copy `.env.example` to `.env` and fill the values. The validator (`env.schema.ts`) refuses to boot if any required variable is missing or if either JWT secret is left as a placeholder.

```bash
cp .env.example .env
# Generate strong secrets
openssl rand -base64 48  # paste into JWT_ACCESS_SECRET
openssl rand -base64 48  # paste into JWT_REFRESH_SECRET
```

Key variables:

| Variable                                   | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `DATABASE_URL`                             | Postgres connection string                               |
| `REDIS_URL`                                | Redis connection string (BullMQ + locks)                 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets (≥32 chars, no placeholder values) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS`  | Token lifetimes                                          |
| `COOKIE_DOMAIN` / `COOKIE_SECURE`          | Cookie scope and security flags                          |
| `SMTP_*`                                   | Outbound email configuration                             |
| `APP_URL`                                  | Public URL of the web frontend (used in emails and CORS) |
| `AUDIT_*` / `SCHEDULER_*`                  | Worker tuning                                            |

## Database migrations

Migrations are **not** executed at process boot. Run them as a one-shot deploy step before scaling up replicas:

```bash
pnpm db:migrate
```

This avoids races between concurrent api/worker instances trying to apply the same DDL.

## API docs

Swagger is mounted at `/docs` only when `NODE_ENV !== 'production'`. In production, expose it behind an internal-only proxy or auth guard if you need it.
