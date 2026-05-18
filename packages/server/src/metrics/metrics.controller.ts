import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { Env } from '../config/env.schema';
import { evaluateMetricsAccess } from './metrics-auth';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async metrics(@Req() request: Request, @Res() response: Response) {
    const access = evaluateMetricsAccess({
      authorization: request.headers.authorization,
      configuredToken: this.configService.get('METRICS_TOKEN', { infer: true }),
      metricsTokenHeader: request.headers['x-metrics-token'],
      nodeEnv: this.configService.get('NODE_ENV', { infer: true }),
    });

    if (access === 'not-found') {
      throw new NotFoundException();
    }

    if (access === 'unauthorized') {
      throw new UnauthorizedException('Metrics token required');
    }

    response.setHeader('Content-Type', this.metricsService.contentType());
    response.send(await this.metricsService.metrics());
  }
}
