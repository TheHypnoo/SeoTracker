# `apps/worker`

Unified background runtime for SEOTracker. It runs BullMQ processors and cron schedulers in a single NestJS application context.

This is the only background entrypoint. Deploy it as one `worker` service instead of the old split `jobs` and `scheduler` services.

## What it does

- Processes queues for SEO audits, CSV exports, outbound webhooks, email deliveries and Google Search Console imports.
- Runs cron tasks for due schedules, orphaned work reconciliation, expired export cleanup and daily Search Console imports.
- Uses Redis-backed distributed locks so multiple worker replicas can run without duplicate scheduler ticks.
- Exposes a small HTTP server for operational checks: `GET /health/liveness`, `GET /health/readiness` and `GET /metrics`.

## Scripts

```bash
pnpm dev          # tsx watch src/main.ts
pnpm build
pnpm start        # production: node dist/main.js
pnpm typecheck
```

## Environment

Copy `.env.example` to `.env`. The worker validates the shared backend env schema, so `DATABASE_URL`, `REDIS_URL`, JWT secrets, SMTP settings and queue tuning must match the API where noted.

```bash
cp .env.example .env
openssl rand -base64 48  # paste into JWT_ACCESS_SECRET (same value as API)
openssl rand -base64 48  # paste into JWT_REFRESH_SECRET (same value as API)
```

Key worker-only variables:

| Variable                       | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `JOBS_HTTP_PORT`               | Port for worker health and metrics server (`4101` by default).            |
| `SCHEDULER_LOCK_KEY`           | Redis lock key for due-schedule dispatch.                                 |
| `SCHEDULER_LOCK_TTL_MS`        | TTL for the scheduler distributed lock.                                   |
| `SCHEDULER_DUE_WINDOW_MINUTES` | Window used to find due scheduled audits.                                 |
| `STORAGE_*`                    | Must match API storage settings so exports written here are downloadable. |
| `GOOGLE_*`                     | Needed when scheduled Search Console imports refresh OAuth tokens.        |

On Railway, `PORT` takes precedence over `JOBS_HTTP_PORT` so the platform healthcheck can target the assigned port.
