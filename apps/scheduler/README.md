# `apps/scheduler`

Cron-driven dispatcher. Reads `site_schedules` and enqueues audit jobs onto the `audit` queue when a site is due for its next run.

## Why a separate service

- The HTTP API stays stateless and does not own timed work.
- Workers (`apps/jobs`) only consume queues; they do not own timing.
- The scheduler is the single owner of "when do we trigger a recurring audit?", which makes it possible to scale workers independently and run multiple replicas of the scheduler safely behind a distributed lock.

## How it works

- A `@nestjs/schedule` cron tick wakes up every minute.
- Each tick acquires a Redis-backed lock (`SET NX PX` + Lua extend/release scripts) so only one replica runs the dispatch loop at a time.
- The dispatch loop selects schedules whose next-run timestamp is in the past, enqueues an audit job (deduplicated by `auditRunId`), and updates `lastRunAt`.
- If the lock is lost mid-tick (Redis evicted the key, network partition, etc.) the in-flight task is aborted via an `AbortSignal` so it stops cleanly instead of running unprotected.

## Scripts

```bash
pnpm dev        # tsx watch
pnpm build
pnpm start      # production
pnpm lint
pnpm typecheck
```

## Environment

Copy `.env.example` to `.env`. Relevant variables:

| Variable                | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string                                |
| `REDIS_URL`             | Required for BullMQ + the distributed lock                |
| `SCHEDULER_LOCK_KEY`    | Redis key used for the dispatcher lock                    |
| `SCHEDULER_LOCK_TTL_MS` | Lock TTL; refreshed in the background while the tick runs |

The service registers `enableShutdownHooks()` so SIGTERM releases the lock and finishes the current tick before exiting.
