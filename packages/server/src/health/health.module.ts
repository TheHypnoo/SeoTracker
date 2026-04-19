import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { OperationalStatusController } from './operational-status.controller';
import { OperationalStatusService } from './operational-status.service';

@Module({
  controllers: [HealthController, OperationalStatusController],
  providers: [OperationalStatusService],
})
export class HealthModule {}
