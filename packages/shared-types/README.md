# `@seotracker/shared-types`

Pure TypeScript module with the enums, API wire shapes and dashboard DTOs shared between backend (`apps/api`, `apps/worker`, `packages/server`) and frontend (`apps/web`).

Keeping these in their own package guarantees a single source of truth: a backend rename surfaces as a frontend type error at build time.

## What it exports

- **Domain enums:** `Role`, `Permission`, `ActivityAction`, `ScheduleFrequency`, `AuditTrigger`, `AuditStatus`, `Severity`, `IssueCode`, `IssueCategory`, `IssueState`, `IndexabilityStatus`, `SeoActionImpact`, `SeoActionEffort`, `LogLevel`, `ComparisonChangeType`, `ExportFormat`, `ExportKind`, `ExportStatus`, `OutboundEvent`, `OutboundDeliveryStatus`, `EmailDeliveryStatus`.
- **Scoring types:** `CriticalRiskLevel`, `SeoImpactTier`, `FalsePositiveRisk`, `ScoreDeduction`, `ScoreBreakdown`.
- **Engine telemetry DTOs:** `EngineRunTimeline`, `EngineStageAggregate`, `EngineHealthSummary`, `EngineHealthTimeseriesPoint`, `EngineModelVersionStats`.
- **Wire shapes:** `ApiError`, `PaginatedResponse<T>`.

The Drizzle schema in `@seotracker/server` consumes these enums directly, so any new value must be added here first; the database migration follows.

## Scripts

```bash
pnpm build
pnpm typecheck
```
