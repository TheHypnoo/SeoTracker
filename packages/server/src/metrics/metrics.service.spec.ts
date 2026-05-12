import { beforeEach, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    service = moduleRef.get(MetricsService);
    service.onModuleInit();
  });

  it('exposes a registry with the expected counters and histograms wired in', async () => {
    const out = await service.metrics();

    // The registry serialization includes one line per registered metric.
    expect(out).toContain('http_requests_total');
    expect(out).toContain('http_request_duration_seconds');
    expect(out).toContain('bullmq_jobs_total');
    expect(out).toContain('bullmq_job_duration_seconds');
    expect(out).toContain('bullmq_queue_depth');
    // Default Node metrics are also collected.
    expect(out).toContain('process_cpu_user_seconds_total');
  });

  it('reports the standard Prometheus content type', () => {
    expect(service.contentType()).toContain('text/plain');
  });

  it('http_requests_total accepts the documented label set', () => {
    // Smoke test: hitting an unregistered label combination would throw.
    service.httpRequestsTotal.inc({ method: 'GET', route: '/x', status: '200' });
    service.bullmqJobsTotal.inc({ queue: 'audits', event: 'completed' });
    service.bullmqQueueDepth.set({ queue: 'audits', state: 'waiting' }, 3);
    // No assertion — the act of calling without throwing is the invariant.
    expect(true).toBe(true);
  });
});
