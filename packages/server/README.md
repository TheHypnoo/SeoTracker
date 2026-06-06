# `@seotracker/server`

Shared backend runtime consumed by `apps/api` and `apps/worker`. Holds the Drizzle schema, Nest modules, domain services and queue/lock primitives that are reused across the deployable backend services.

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

This package is library-style; it doesn't run on its own. The deployable services (`api`, `worker`) build it as a `pre*` step (`pnpm --filter @seotracker/server build`).

```bash
pnpm build
pnpm typecheck
pnpm test
```

### Score calibration with PageSpeed Insights

The internal calibration script can compare SEOTracker score with Google
PageSpeed/Lighthouse SEO scores:

```bash
pnpm score:calibrate -- \
  --with-pagespeed \
  --pagespeed-strategy both \
  --env-file /absolute/path/to/apps/api/.env
```

Authentication is optional. The script uses the first available option:

1. `PAGESPEED_API_KEY`, `GOOGLE_PAGESPEED_API_KEY` or `GOOGLE_API_KEY`.
2. OAuth access/refresh token:
   - `PAGESPEED_OAUTH_ACCESS_TOKEN`, `GOOGLE_OAUTH_ACCESS_TOKEN` or `GOOGLE_ACCESS_TOKEN`.
   - `PAGESPEED_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_REFRESH_TOKEN` or `GOOGLE_REFRESH_TOKEN`
     plus `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - The Google OAuth grant must include the `openid` scope required by
     PageSpeed Insights. A Search Console-only grant may not be enough unless
     it also requested `openid`.
3. A persisted `google_oauth_connections` row when `DATABASE_URL`,
   `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   are available. Use `PAGESPEED_GOOGLE_CONNECTION_ID` or
   `PAGESPEED_GOOGLE_PROJECT_ID` to pin a specific connection.
4. No credentials, useful only for small manual runs.

Use `--pagespeed-strategy mobile`, `desktop` or `both`. Results include
`pageSpeedSeoScoreMobile`, `pageSpeedSeoScoreDesktop` and deltas against
the active score in the JSON payload and Markdown report.

### Audit fetch retries and sitemap limits

Crawler fetches use a small bounded retry policy for transient failures:
timeouts, `429`, and most `5xx` responses are retried once by default. Tune
with `AUDIT_FETCH_RETRY_ATTEMPTS` (`1`–`3`, default `2`).

Sitemap files are capped at the official Sitemap protocol / Google limit of
50MB uncompressed and 50,000 URLs per sitemap file. Oversized or timing-out
sitemap probes no longer emit `MISSING_SITEMAP`; they lower crawl confidence
and are reported through sitemap discovery metrics instead.
