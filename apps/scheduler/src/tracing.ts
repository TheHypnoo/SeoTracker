// MUST be the very first import in apps/scheduler/src/main.ts so OpenTelemetry
// auto-instrumentations can patch http/pg/ioredis before they are required.
import { startTracing } from '@seotracker/server/tracing';

startTracing({ serviceName: 'seotracker-scheduler' });
