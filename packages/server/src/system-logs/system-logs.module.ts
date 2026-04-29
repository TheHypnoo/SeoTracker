import { Global, Module } from '@nestjs/common';

import { SystemLogsService } from './system-logs.service';

@Global()
@Module({
  exports: [SystemLogsService],
  providers: [SystemLogsService],
})
export class SystemLogsModule {}
