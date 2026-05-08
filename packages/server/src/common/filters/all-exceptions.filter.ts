import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] | object = 'Internal server error';
    if (isHttp) {
      const exceptionResponse = exception.getResponse();
      message = normalizeHttpExceptionMessage(exceptionResponse);
    } else if (exception instanceof Error) {
      ({ message } = exception);
    }

    const requestId = request.requestId ?? request.headers[REQUEST_ID_HEADER];
    const isProduction = process.env.NODE_ENV === 'production';

    if (status >= 500) {
      this.logger.error(
        `[${requestId ?? 'no-req-id'}] ${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: Record<string, unknown> = {
      message: isProduction && status >= 500 ? 'Internal server error' : message,
      path: request.url,
      statusCode: status,
      timestamp: new Date().toISOString(),
    };
    if (requestId) {
      body.requestId = requestId;
    }

    response.status(status).json(body);
  }
}

function normalizeHttpExceptionMessage(
  exceptionResponse: string | object,
): string | string[] | object {
  if (typeof exceptionResponse === 'string') {
    return exceptionResponse;
  }

  const rawMessage = (exceptionResponse as { message?: unknown }).message;
  if (
    typeof rawMessage === 'string' ||
    (Array.isArray(rawMessage) && rawMessage.every((item) => typeof item === 'string'))
  ) {
    return rawMessage;
  }

  return exceptionResponse;
}
