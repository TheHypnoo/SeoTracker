# SEOTracker documentation audit

This audit records the documentation consistency pass performed after syncing `main` on 2026-06-07.

## Source-of-truth checks

| Area            | Current source of truth                                   | Documentation expectation                                                                                                                            |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | `package.json` → `packageManager: pnpm@11.0.8`            | Docs must require pnpm 11.0.8, not pnpm 10.x.                                                                                                        |
| Services        | `apps/api`, `apps/worker`, `apps/web`                     | Docs must refer to one unified `worker`, not split `jobs` + `scheduler` services.                                                                    |
| Health checks   | API global prefix `api/v1`; worker standalone HTTP server | API health paths are `/api/v1/health/liveness` and `/api/v1/health/readiness`; worker paths are `/health/liveness` and `/health/readiness`.          |
| Migrations      | `apps/api/src/main.ts` calls `runDatabaseMigrations()`    | Docs should say API boot applies pending migrations as a safety net, while `pnpm db:migrate` remains the recommended controlled step before scaling. |
| Schema          | `packages/server/src/database/schema.ts`                  | Docs should reflect 38 tables and 18 enums, including Search Console, engine telemetry, activity log and email deliveries.                           |
| Observability   | `audit_engine_telemetry`, engine-health routes and UI     | Docs should name the internal engine telemetry system and the platform-admin guard (`PLATFORM_ADMIN_EMAILS`).                                        |
| Benchmark       | `packages/server/scripts/score-calibration-domains.txt`   | Docs should mention the 216-site score calibration benchmark and PageSpeed comparison mode.                                                          |
| Infra layout    | Existing `infra/docker`, `infra/proxy`, `infra/railway`   | Docs must not reference a missing `infra/render` directory.                                                                                          |

## Inconsistencies fixed

- Aligned root README requirements with `pnpm@11.0.8`.
- Added `apps/worker/.env` to contributor quickstart setup.
- Replaced stale `jobs`/`scheduler` service wording with unified `worker` wording.
- Corrected API health endpoint paths and metrics prefix.
- Updated migration docs to match API bootstrap behavior.
- Removed stale Drizzle 1.0 beta/outdated-migration-folder notes; the repo currently pins `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10`.
- Expanded server/shared-types docs to cover current schema, enums, telemetry DTOs and operational modules.
- Added engine telemetry and the +200-site benchmark to the high-level docs.
- Removed the missing Render infra reference.
- Updated web docs to include Search Console, activity settings, public badges and platform engine-health views.

## Follow-up watchlist

- Keep README and `README.es.md` in sync; English remains the stated source of truth.
- If API migration behavior changes again, update root README, `apps/api/README.md`, `infra/README.md`, `infra/railway/README.md` and this audit together.
- If the benchmark corpus size changes, update the count in README, `README.es.md`, `ARCHITECTURE.md`, `packages/server/README.md` and this audit.
