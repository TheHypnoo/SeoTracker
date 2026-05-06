# `@seotracker/server`

Shared backend runtime consumed by `apps/api`, `apps/jobs` and `apps/scheduler`. Holds the Drizzle schema, Nest modules, domain services and queue/lock primitives that are reused across the three deployable backend services.

## What lives here

- `database/` — Drizzle schema (`schema.ts`), connection pool, migration metadata.
- `auth/` — JWT strategy, password hashing, refresh-token rotation, password reset flow.
- `users/`, `projects/`, `sites/`, `audits/`, `exports/`, `webhooks/`, `notifications/`, `system-logs/` — domain modules.
- `seo-engine/` — crawler, page fetcher (SSRF-guarded), issue detectors, scoring.
- `queue/` — BullMQ producer facade + Redis-backed `DistributedLockService`.
- `throttler/` — user-or-IP rate-limit guard with Cloudflare/Railway-aware IP fallback.
- `common/` — shared utilities (assertions, secure equals, hashed token helpers, safe fetch).
- `config/` — `env.schema.ts` (Zod validator) used by every backend service.

Everything is exposed via the package's barrel; consuming apps re-export and wire modules into their own `AppModule`.

## Database schema

The schema is the source of truth and is documented inline (each table and enum has a JSDoc summary in [`src/database/schema.ts`](src/database/schema.ts)).

26 tables across these areas:

- **Identity:** `users`, `user_preferences`, `refresh_tokens`, `password_reset_tokens`.
- **Multi-tenancy:** `projects`, `project_members`, `project_invites`.
- **Sites:** `sites`, `site_schedules`, `alert_rules`.
- **Audits:** `audit_runs`, `audit_pages`, `audit_issues`, `audit_metrics`, `audit_events`, `site_issues` (cross-run state machine), `audit_comparisons`, `audit_comparison_changes`.
- **Exports:** `audit_exports`.
- **Webhooks:** `webhook_endpoints`, `webhook_secrets` (inbound), `outbound_webhooks`, `outbound_webhook_deliveries` (outbound).
- **Operational:** `notifications`, `job_failures`, `system_logs`.

14 enums (role, schedule frequency, audit trigger/status, severity, issue code/category/state, log level, comparison change type, export format/kind/status, outbound delivery status).

## Migration policy

- Migrations live in [`apps/api/drizzle/`](../../apps/api/drizzle); generation and application is owned by the API workspace (`pnpm --filter api db:generate` / `db:migrate`).
- One migration per functional change. Avoid checkpoint commits and squash drift before merging.
- Migrations are run as a one-shot deploy step before scaling replicas, never at process boot. This avoids races between concurrent replicas trying to apply the same DDL.

## Scripts

This package is library-style; it doesn't run on its own. The deployable services (`api`, `jobs`, `scheduler`) build it as a `pre*` step (`pnpm --filter @seotracker/server build`).

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```
