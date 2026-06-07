# `@seotracker/server`

Shared backend runtime consumed by `apps/api` and `apps/worker`. Holds the Drizzle schema, Nest modules, domain services and queue/lock primitives reused by the deployable backend services.

## What lives here

- `database/` — Drizzle schema (`schema.ts`), connection pool and migration metadata.
- `auth/` — JWT strategy, password hashing, refresh-token rotation, password reset flow and CSRF helpers.
- `users/`, `projects/`, `sites/`, `invitations/` — identity, tenancy, site settings, crawl config and public badge administration.
- `audits/` — audit orchestration, comparisons, site issue reconciliation, action plans and engine telemetry APIs.
- `seo-engine/` — crawler, page fetcher (SSRF-guarded), issue detectors, scoring and per-stage telemetry collection.
- `search-console/`, `google/` — Google OAuth, Search Console property linking, daily imports and GSC trend data.
- `exports/` — CSV export orchestration and storage integration.
- `notifications/`, `outbound-webhooks/`, `webhooks/` — in-app notifications, email deliveries and inbound/outbound webhooks.
- `queue/` — BullMQ producer facade, processors, job-failure recording and Redis-backed `DistributedLockService`.
- `scheduling/` — cron dispatch for scheduled audits, import jobs, export cleanup and orphaned work reconciliation.
- `metrics/`, `health/`, `system-logs/`, `activity-log/` — operational endpoints and audit trail.
- `config/` — `env.schema.ts` (Zod validator) used by every backend service.

Everything consumed outside this package is exported through the package barrel in `src/index.ts`.

## Database schema

The schema is the source of truth and is documented inline in [`src/database/schema.ts`](src/database/schema.ts).

38 tables across these areas:

- **Identity:** `users`, `user_preferences`, `refresh_tokens`, `password_reset_tokens`.
- **Multi-tenancy:** `projects`, `project_members`, `project_invites`, `activity_log`.
- **Sites:** `sites`, `site_schedules`, `site_crawl_configs`, `alert_rules`, public badge state.
- **Google Search Console:** `google_oauth_connections`, `google_oauth_states`, `search_console_properties`, `site_search_console_links`, `gsc_daily_stats`, `tracked_keywords`.
- **Audits:** `audit_runs`, `audit_engine_telemetry`, `audit_pages`, `audit_url_inspections`, `audit_issues`, `audit_action_items`, `audit_metrics`, `audit_events`, `site_issues`, `audit_comparisons`, `audit_comparison_changes`.
- **Exports:** `audit_exports`.
- **Webhooks:** `webhook_endpoints`, `webhook_secrets`, `outbound_webhooks`, `outbound_webhook_deliveries`.
- **Operational:** `notifications`, `email_deliveries`, `job_failures`, `system_logs`.

18 enums cover roles/permissions, scheduling, audit status/trigger, issue severity/category/state, indexability/action-plan metadata, logs, comparison changes, export state, outbound events and email delivery state.

## Migration policy

- Migrations live in [`apps/api/drizzle/`](../../apps/api/drizzle); generation and application are owned by the API workspace (`pnpm --filter api db:generate` / `db:migrate`).
- `apps/api` runs `runDatabaseMigrations()` on bootstrap as a safety net. For production, still run `pnpm db:migrate` before starting or scaling API replicas so schema changes are controlled.
- `apps/worker` never runs migrations.
- One migration per functional change. Avoid checkpoint commits and squash drift before merging.

## Scripts

This package is library-style; it doesn't run on its own. The deployable services (`api`, `worker`) build it as part of their dependency graph.

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm score:calibrate
```

## Engine telemetry

The SEO engine emits a structured telemetry event for every major audit stage. During audit persistence those events are stored in `audit_engine_telemetry` with stage name, status, duration and JSON details.

Platform-admin endpoints aggregate that data for operations dashboards:

- `GET /api/v1/audits/:auditId/engine-telemetry` — per-audit waterfall.
- `GET /api/v1/engine-health` — p50/p95/error-rate by stage.
- `GET /api/v1/engine-health/timeseries` — daily stage trends.
- `GET /api/v1/engine-health/model-versions` — compare stage reliability across scoring model versions.

All engine-health endpoints require `JwtAuthGuard` plus `PlatformAdminGuard`; configure `PLATFORM_ADMIN_EMAILS` on the API service to grant access.

## Score calibration benchmark (+200 webs)

The internal calibration script compares SEOTracker scores across a curated corpus of 216 public websites and can optionally call Google PageSpeed Insights/Lighthouse SEO for a reference score:

```bash
pnpm score:calibrate -- \
  --with-pagespeed \
  --pagespeed-strategy both \
  --env-file /absolute/path/to/apps/api/.env
```

Useful options:

- `--input <path>` — custom domain corpus (defaults to `scripts/score-calibration-domains.txt`).
- `--limit <n>` — dry-run the first `n` domains.
- `--concurrency <n>` — parallel domain audits (default `3`; keep conservative for public sites).
- `--output <path>` / `--report <path>` — JSON payload and Markdown report paths (default `tmp/score-calibration/`).
- `--with-pagespeed --pagespeed-strategy mobile|desktop|both` — compare against PageSpeed SEO scores.

Authentication is optional. The script uses the first available option:

1. `PAGESPEED_API_KEY`, `GOOGLE_PAGESPEED_API_KEY` or `GOOGLE_API_KEY`.
2. OAuth access/refresh token:
   - `PAGESPEED_OAUTH_ACCESS_TOKEN`, `GOOGLE_OAUTH_ACCESS_TOKEN` or `GOOGLE_ACCESS_TOKEN`.
   - `PAGESPEED_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_REFRESH_TOKEN` or `GOOGLE_REFRESH_TOKEN` plus `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - The Google OAuth grant must include the `openid` scope required by PageSpeed Insights. A Search Console-only grant may not be enough unless it also requested `openid`.
3. A persisted `google_oauth_connections` row when `DATABASE_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are available. Use `PAGESPEED_GOOGLE_CONNECTION_ID` or `PAGESPEED_GOOGLE_PROJECT_ID` to pin a specific connection.
4. No credentials, useful only for small manual runs.

Results include `pageSpeedSeoScoreMobile`, `pageSpeedSeoScoreDesktop`, deltas against SEOTracker, top deductions, issue summaries and the slowest engine-telemetry stages.

## Audit fetch retries and sitemap limits

Crawler fetches use a small bounded retry policy for transient failures: timeouts, `429`, and most `5xx` responses are retried once by default. Tune with `AUDIT_FETCH_RETRY_ATTEMPTS` (`1`–`3`, default `2`).

Sitemap files are capped at the official Sitemap protocol / Google limit of 50MB uncompressed and 50,000 URLs per sitemap file. Oversized or timing-out sitemap probes lower crawl confidence and are reported through sitemap discovery metrics instead of emitting misleading `MISSING_SITEMAP` issues.
