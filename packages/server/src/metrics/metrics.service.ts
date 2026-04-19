import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    help: 'Total HTTP requests handled by the API.',
    labelNames: ['method', 'route', 'status'] as const,
    name: 'http_requests_total',
    registers: [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    help: 'Latency of HTTP requests handled by the API, in seconds.',
    labelNames: ['method', 'route', 'status'] as const,
    name: 'http_request_duration_seconds',
    registers: [this.registry],
  });

  readonly bullmqJobsTotal = new Counter({
    help: 'BullMQ job lifecycle counter (started, completed, failed).',
    labelNames: ['queue', 'event'] as const,
    name: 'bullmq_jobs_total',
    registers: [this.registry],
  });

  readonly bullmqJobDurationSeconds = new Histogram({
    buckets: [0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
    help: 'Duration of BullMQ jobs in seconds.',
    labelNames: ['queue', 'status'] as const,
    name: 'bullmq_job_duration_seconds',
    registers: [this.registry],
  });

  readonly bullmqQueueDepth = new Gauge({
    help: 'Current depth of BullMQ queues by state.',
    labelNames: ['queue', 'state'] as const,
    name: 'bullmq_queue_depth',
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  metrics() {
    return this.registry.metrics();
  }

  contentType() {
    return this.registry.contentType;
  }
}
