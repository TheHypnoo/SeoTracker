import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';

function makeReq(headers: Record<string, unknown> = {}, withPinoId?: string) {
  const req = { headers } as unknown as Request & { id?: string };
  if (withPinoId) req.id = withPinoId;
  return req;
}

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    getHeader: jest.fn((name: string) => headers[name.toLowerCase()]),
    setHeader: jest.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
    headers,
  } as unknown as Response & { headers: Record<string, string> };
}

describe('requestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('reuses pino-http req.id when present', () => {
    const req = makeReq({}, 'pino-uuid-123');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect((req as Request & { requestId: string }).requestId).toBe('pino-uuid-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'pino-uuid-123');
    expect(next).toHaveBeenCalled();
  });

  it('uses the incoming x-request-id header when valid (≤128 chars, non-empty string)', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'client-supplied-id' });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect((req as Request & { requestId: string }).requestId).toBe('client-supplied-id');
  });

  it('rejects an over-long incoming header (DoS guard) and falls back to UUID', () => {
    const longId = 'x'.repeat(200);
    const req = makeReq({ [REQUEST_ID_HEADER]: longId });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    const id = (req as Request & { requestId: string }).requestId;
    expect(id).not.toBe(longId);
    // UUID v4 length
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('does not overwrite an existing response header', () => {
    const req = makeReq();
    const res = makeRes();
    res.headers[REQUEST_ID_HEADER] = 'existing';
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    // Was already set → setHeader should not be called.
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
