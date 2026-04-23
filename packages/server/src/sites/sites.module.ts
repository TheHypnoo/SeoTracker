import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { PublicBadgesModule } from '../public-badges/public-badges.module';
import { CrawlConfigService } from './crawl-config.service';
import { PublicBadgeAdminService } from './public-badge-admin.service';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [ProjectsModule, PublicBadgesModule],
  controllers: [SitesController],
  providers: [SitesService, CrawlConfigService, PublicBadgeAdminService],
  exports: [SitesService, CrawlConfigService, PublicBadgeAdminService],
})
export class SitesModule {}
