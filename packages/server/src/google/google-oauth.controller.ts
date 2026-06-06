import { Controller, Delete, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import type { Env } from '../config/env.schema';
import { GoogleOauthService } from './google-oauth.service';

@ApiTags('google')
@Controller()
export class GoogleOauthController {
  constructor(
    private readonly googleOauthService: GoogleOauthService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Get('projects/:projectId/google/oauth/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Google OAuth authorization URL for Search Console access' })
  start(@CurrentUser() user: { sub: string }, @Param('projectId', UUID_V4_PIPE) projectId: string) {
    return this.googleOauthService.buildAuthorizationUrl(projectId, user.sub);
  }

  @Get('google/oauth/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const baseUrl = this.integrationRedirectUrl();
    if (error) {
      response.redirect(`${baseUrl}?google=error&reason=${encodeURIComponent(error)}`);
      return;
    }

    await this.googleOauthService.completeCallback({ code: code ?? '', state: state ?? '' });
    response.redirect(`${baseUrl}?google=connected`);
  }

  @Get('projects/:projectId/google/connections')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active Google OAuth connections for a project' })
  list(@CurrentUser() user: { sub: string }, @Param('projectId', UUID_V4_PIPE) projectId: string) {
    return this.googleOauthService.listConnections(projectId, user.sub);
  }

  @Delete('projects/:projectId/google/connections/:connectionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a Google OAuth connection' })
  revoke(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Param('connectionId', UUID_V4_PIPE) connectionId: string,
  ) {
    return this.googleOauthService.revokeConnection(projectId, connectionId, user.sub);
  }

  private integrationRedirectUrl(): string {
    const appUrl = this.configService.get('APP_URL', { infer: true });
    return new URL('/settings/integrations', appUrl).toString();
  }
}
