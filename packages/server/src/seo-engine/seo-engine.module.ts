import { Module } from '@nestjs/common';

import { SeoEngineService } from './seo-engine.service';

@Module({
  exports: [SeoEngineService],
  providers: [SeoEngineService],
})
export class SeoEngineModule {}
