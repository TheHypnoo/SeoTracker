import { Global, Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  exports: [MetricsService, HttpMetricsInterceptor],
  providers: [MetricsService, HttpMetricsInterceptor],
})
export class MetricsModule {}
