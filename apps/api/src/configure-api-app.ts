import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from '@seotracker/server';
import type { Env } from '@seotracker/server';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

export function configureApiApp(app: NestExpressApplication) {
  const configService = app.get(ConfigService<Env, true>);
  const isProduction = configService.get('NODE_ENV', { infer: true }) === 'production';

  // Number of proxy hops to trust for X-Forwarded-* parsing. Required for
  // accurate req.ip behind Railway / Cloudflare. Set TRUST_PROXY in env to
  // the exact hop count (1 = Railway, 2 = Railway + Cloudflare).
  app.set('trust proxy', configService.get('TRUST_PROXY', { infer: true }));
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Parse APP_URL into a URL and use only its origin component (scheme +
  // host + port). Zod already validates the env value, but passing the raw
  // string would also forward any path/query, and a misconfigured value
  // would silently widen CORS. Reject wildcards explicitly.
  const appOrigin = parseCorsOrigin(configService.get('APP_URL', { infer: true }));

  app.enableCors({
    credentials: true,
    origin: appOrigin,
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // (Swagger docs only in non-production.)
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SEOTracker API')
      .setDescription('API REST para SEOTracker')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }
}

export function parseCorsOrigin(rawAppUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawAppUrl);
  } catch {
    throw new Error(`APP_URL is not a valid URL: ${rawAppUrl}`);
  }

  if (parsed.hostname.includes('*')) {
    throw new Error(`APP_URL must not contain a wildcard host: ${rawAppUrl}`);
  }

  return parsed.origin;
}
