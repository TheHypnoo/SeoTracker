// MUST be the very first import in apps/jobs/src/main.ts so OpenTelemetry
// auto-instrumentations can patch http/pg/ioredis/bullmq before they are
// required.
import { startTracing } from '@seotracker/server/tracing';

startTracing({ serviceName: 'seotracker-jobs' });
