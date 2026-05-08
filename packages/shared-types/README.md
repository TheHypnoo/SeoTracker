# `@seotracker/shared-types`

Pure TypeScript module with the types and enums shared between backend (`apps/api`, `apps/worker`, `packages/server`) and frontend (`apps/web`).

Keeping these in their own package guarantees a single source of truth: a backend rename surfaces as a frontend type error at build time.

## What it exports

- **Domain enums:** `Role`, `ScheduleFrequency`, `AuditTrigger`, `AuditStatus`, `Severity`, `IssueCode` (the closed catalogue of detectable SEO issues), `IssueCategory`, `IssueState`, `LogLevel`, `ComparisonChangeType`, `ExportFormat`, `ExportKind`, `ExportStatus`, `OutboundEvent`, `OutboundDeliveryStatus`.
- **Wire shapes:** `ApiError`, `PaginatedResponse<T>`.

The Drizzle schema in `@seotracker/server` consumes these enums directly, so any new value must be added here first; the database migration follows.

## Scripts

```bash
pnpm build
pnpm typecheck
pnpm lint
```
