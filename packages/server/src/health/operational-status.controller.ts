import { Controller, Inject, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OperationalStatusService } from './operational-status.service';

@Controller('system')
@UseGuards(JwtAuthGuard)
export class OperationalStatusController {
  private readonly operationalStatusService: OperationalStatusService;

  constructor(@Inject(OperationalStatusService) operationalStatusService: unknown) {
    this.operationalStatusService = operationalStatusService as OperationalStatusService;
  }

  @Get('status')
  status() {
    return this.operationalStatusService.getStatus();
  }
}
