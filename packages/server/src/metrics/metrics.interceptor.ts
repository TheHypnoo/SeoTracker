import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const stop = (errored: boolean) => {
      const route = request.route?.path ?? request.path ?? 'unknown';
      const { method } = request;
      const status = errored && response.statusCode < 400 ? 500 : response.statusCode;
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      const labels = { method, route, status: String(status) };
      this.metricsService.httpRequestsTotal.inc(labels);
      this.metricsService.httpRequestDurationSeconds.observe(labels, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        error: () => stop(true),
        next: () => stop(false),
      }),
    );
  }
}
