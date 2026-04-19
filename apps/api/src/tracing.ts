// MUST be the very first import in apps/api/src/main.ts so OpenTelemetry
// auto-instrumentations can patch http/express/pg/ioredis/bullmq before they
// are required.
import { startTracing } from '@seotracker/server/tracing';

startTracing({ serviceName: 'seotracker-api' });
