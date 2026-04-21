import { Module } from '@nestjs/common';

import { OnboardingService } from './onboarding.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, OnboardingService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
