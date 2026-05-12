import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';

import { MetricsService } from './metrics.service';
import { HttpMetricsInterceptor } from './metrics.interceptor';

function makeContext(opts: {
  method: string;
  routePath?: string;
  statusCode: number;
  type?: 'http' | 'rpc';
}): ExecutionContext {
  const req = { method: opts.method, route: { path: opts.routePath }, path: opts.routePath };
  const res = { statusCode: opts.statusCode };
  return {
    getType: () => opts.type ?? 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('httpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let metrics: MetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HttpMetricsInterceptor, MetricsService],
    }).compile();
    interceptor = moduleRef.get(HttpMetricsInterceptor);
    metrics = moduleRef.get(MetricsService);
    metrics.onModuleInit();
  });

  it('skips non-HTTP execution contexts (e.g. websocket / rpc)', async () => {
    const incSpy = jest.spyOn(metrics.httpRequestsTotal, 'inc');
    const ctx = makeContext({ method: 'GET', statusCode: 200, type: 'rpc' });

    const obs = interceptor.intercept(ctx, { handle: () => of('result') } as CallHandler);
    await firstValueFrom(obs);

    expect(incSpy).not.toHaveBeenCalled();
  });

  it('records a counter + histogram on a successful 2xx response', async () => {
    const incSpy = jest.spyOn(metrics.httpRequestsTotal, 'inc');
    const ctx = makeContext({ method: 'GET', routePath: '/api/v1/sites', statusCode: 200 });

    const obs = interceptor.intercept(ctx, { handle: () => of('result') } as CallHandler);
    await firstValueFrom(obs);

    expect(incSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/api/v1/sites', status: '200' }),
    );
  });

  it('records 500 status when the handler errors and the response statusCode is still <400', async () => {
    const incSpy = jest.spyOn(metrics.httpRequestsTotal, 'inc');
    const ctx = makeContext({ method: 'POST', routePath: '/x', statusCode: 200 });

    const obs = interceptor.intercept(ctx, {
      handle: () => throwError(() => new Error('boom')),
    } as unknown as CallHandler);
    await expect(firstValueFrom(obs)).rejects.toThrow('boom');

    expect(incSpy).toHaveBeenCalledWith(expect.objectContaining({ status: '500' }));
  });
});
