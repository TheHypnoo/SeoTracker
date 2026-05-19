import { describe, expect, it, jest } from '@jest/globals';
import { SwaggerModule } from '@nestjs/swagger';

import { configureApiApp } from './configure-api-app';

jest.mock('@seotracker/server', () => ({ AllExceptionsFilter: jest.fn() }), { virtual: true });

jest.mock<typeof import('helmet')>(
  'helmet',
  () => ({ __esModule: true, default: jest.fn().mockReturnValue('helmet-middleware') }) as never,
);
jest.mock<typeof import('cookie-parser')>(
  'cookie-parser',
  () =>
    ({ __esModule: true, default: jest.fn().mockReturnValue('cookie-parser-middleware') }) as never,
);
jest.mock<typeof import('express')>(
  'express',
  () =>
    ({
      __esModule: true,
      default: {
        json: jest.fn().mockReturnValue('json-middleware'),
        urlencoded: jest.fn().mockReturnValue('urlencoded-middleware'),
      },
    }) as never,
);
jest.mock<typeof import('@nestjs/swagger')>(
  '@nestjs/swagger',
  () =>
    ({
      DocumentBuilder: jest.fn().mockReturnValue({
        addBearerAuth: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue({ title: 'built' }),
        setDescription: jest.fn().mockReturnThis(),
        setTitle: jest.fn().mockReturnThis(),
        setVersion: jest.fn().mockReturnThis(),
      }),
      SwaggerModule: {
        createDocument: jest.fn().mockReturnValue({ openapi: '3.0.0' }),
        setup: jest.fn(),
      },
    }) as never,
);

function makeApp(nodeEnv: 'development' | 'production') {
  const calls: string[] = [];
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        APP_URL: 'https://app.test',
        NODE_ENV: nodeEnv,
        TRUST_PROXY: 2,
      };
      return values[key];
    }),
  };
  const app = {
    enableCors: jest.fn(),
    enableShutdownHooks: jest.fn(),
    get: jest.fn(() => config),
    set: jest.fn((key: string, _value?: unknown) => calls.push(`set:${key}`)),
    setGlobalPrefix: jest.fn(),
    use: jest.fn(),
    useGlobalFilters: jest.fn(),
    useGlobalPipes: jest.fn(),
  };
  return { app, calls };
}

describe('configureApiApp', () => {
  it('configures middleware, CORS and the global API prefix', () => {
    const { app, calls } = makeApp('development');

    configureApiApp(app as never);

    expect(calls).toStrictEqual(['set:trust proxy']);
    expect(app.enableCors).toHaveBeenCalledWith({ credentials: true, origin: 'https://app.test' });
    expect(app.set).toHaveBeenCalledWith('trust proxy', 2);
    expect(app.use).toHaveBeenCalledTimes(4);
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1');
  });

  it('installs global validation, filters, shutdown hooks and Swagger outside production', () => {
    const { app } = makeApp('development');

    configureApiApp(app as never);

    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(
      app as never,
      {
        title: 'built',
      } as never,
    );
    expect(SwaggerModule.setup).toHaveBeenCalledWith('docs', app as never, { openapi: '3.0.0' });
  });

  it('skips Swagger in production', () => {
    jest.clearAllMocks();
    const { app } = makeApp('production');

    configureApiApp(app as never);

    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });
});
