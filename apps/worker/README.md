# worker

Unified background runtime for SEOTracker. It runs the BullMQ processors
(`audits`, `exports`, outbound webhooks and email deliveries) and the cron
scheduler in a single NestJS application context.

This is the only background entrypoint. Deploy it as the single Railway worker
service instead of separate `jobs` and `scheduler` services.
