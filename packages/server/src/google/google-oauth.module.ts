import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { GoogleOauthClient } from './google-oauth.client';
import { GoogleOauthController } from './google-oauth.controller';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthStateService } from './google-oauth-state.service';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
  imports: [ProjectsModule],
  controllers: [GoogleOauthController],
  providers: [
    GoogleOauthClient,
    GoogleOauthService,
    GoogleOauthStateService,
    TokenEncryptionService,
  ],
  exports: [GoogleOauthService, TokenEncryptionService],
})
export class GoogleOauthModule {}
