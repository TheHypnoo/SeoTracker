# `apps/jobs`

Background workers service. Consumes the BullMQ queues exposed by [`@seotracker/server`](../../packages/server) and runs the heavy lifting outside the HTTP path.

## Queues consumed

| Queue                 | Job name           | Purpose                                                                        |
| --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `audit`               | `run-audit`        | Crawl a site, detect issues, persist run + score, fire follow-up events.       |
| `export`              | `build-export`     | Build a CSV/PDF/JSON file from audit data, store it, mark the export complete. |
| `outbound-deliveries` | `deliver-outbound` | POST a webhook event to a user-registered URL with HMAC signature.             |

Default cleanup policy: completed jobs are kept 24h or until 200 entries; failed jobs 7 days or until 1k entries. Permanent failures are also mirrored to the `job_failures` table for forensic analysis.

## Scripts

```bash
pnpm dev        # tsx watch
pnpm build
pnpm start      # production
pnpm lint
pnpm typecheck
```

## Environment

Copy `.env.example` to `.env`. Most of the configuration is shared with the API; the worker reads the same secrets and queue tuning variables.

| Variable                                                     | Purpose                            |
| ------------------------------------------------------------ | ---------------------------------- |
| `DATABASE_URL`                                               | Postgres connection string         |
| `REDIS_URL`                                                  | BullMQ connection                  |
| `AUDIT_CONCURRENCY_GLOBAL` / `AUDIT_CONCURRENCY_PER_PROJECT` | Worker concurrency caps            |
| `AUDIT_HTTP_TIMEOUT_MS`                                      | Per-request timeout while crawling |
| `AUDIT_MAX_LINKS` / `AUDIT_MAX_PAGES`                        | Crawl-depth limits                 |

The worker registers `enableShutdownHooks()` so SIGTERM drains in-flight jobs before exit.
