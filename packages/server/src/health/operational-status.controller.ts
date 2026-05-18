import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OperationalStatusService } from './operational-status.service';

@Controller('system')
@UseGuards(JwtAuthGuard)
export class OperationalStatusController {
  constructor(private readonly operationalStatusService: OperationalStatusService) {}

  @Get('status')
  status() {
    return this.operationalStatusService.getStatus();
  }
}
