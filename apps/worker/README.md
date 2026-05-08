# worker

Unified background runtime for SEOTracker. It runs the BullMQ processors
(`audits`, `exports`, outbound webhooks and email deliveries) and the cron
scheduler in a single NestJS application context.

Use this service for small Railway deployments where `jobs` and `scheduler`
should share one service slot. Keep `apps/jobs` and `apps/scheduler` available
for larger deployments that need independent scaling.
