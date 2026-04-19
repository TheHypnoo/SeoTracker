import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

const isProduction = process.env.NODE_ENV === 'production';
const ALL_ROUTES = [{ method: RequestMethod.ALL, path: '{*path}' }];

const baseOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  redact: {
    censor: '[REDACTED]',
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tokenHash',
      '*.secret',
    ],
    remove: false,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          options: {
            ignore: 'pid,hostname',
            singleLine: true,
            translateTime: 'SYS:HH:MM:ss.l',
          },
          target: 'pino-pretty',
        },
      }),
};

@Module({
  exports: [PinoLoggerModule],
  imports: [
    PinoLoggerModule.forRoot({
      forRoutes: ALL_ROUTES,
      pinoHttp: {
        ...baseOptions,
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers[REQUEST_ID_HEADER];
          const requestId =
            typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
              ? incoming
              : randomUUID();
          res.setHeader(REQUEST_ID_HEADER, requestId);
          return requestId;
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        autoLogging: {
          ignore: (req) => req.url === '/api/v1/health/liveness',
        },
      },
    }),
  ],
})
export class LoggerHttpModule {}

@Module({
  exports: [PinoLoggerModule],
  imports: [
    PinoLoggerModule.forRoot({
      forRoutes: ALL_ROUTES,
      pinoHttp: { ...baseOptions, autoLogging: false, quietReqLogger: true },
    }),
  ],
})
export class LoggerWorkerModule {}
