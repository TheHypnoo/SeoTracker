import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // pino-http (LoggerHttpModule) runs before this middleware and assigns
    // `req.id` via genReqId; reuse it so the request-id is the same across
    // structured logs, headers, and any code that reads `req.requestId`.
    const fromPino = (req as Request & { id?: string | number }).id;
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof fromPino === 'string' && fromPino.length > 0
        ? fromPino
        : typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
          ? incoming
          : randomUUID();

    (req as Request & { requestId: string }).requestId = requestId;
    if (!res.getHeader(REQUEST_ID_HEADER)) {
      res.setHeader(REQUEST_ID_HEADER, requestId);
    }
    next();
  }
}
