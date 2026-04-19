import './tracing';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from '@seotracker/server';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApiApp } from './configure-api-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const configService = app.get(ConfigService<Env, true>);
  configureApiApp(app);

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
