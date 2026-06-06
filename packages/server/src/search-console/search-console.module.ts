import { Module } from '@nestjs/common';

import { GoogleOauthModule } from '../google/google-oauth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SearchConsoleClient } from './search-console.client';
import { SearchConsoleController, SiteSearchConsoleController } from './search-console.controller';
import { SearchConsoleService } from './search-console.service';

@Module({
  imports: [GoogleOauthModule, ProjectsModule],
  controllers: [SearchConsoleController, SiteSearchConsoleController],
  providers: [SearchConsoleClient, SearchConsoleService],
  exports: [SearchConsoleService],
})
export class SearchConsoleModule {}
