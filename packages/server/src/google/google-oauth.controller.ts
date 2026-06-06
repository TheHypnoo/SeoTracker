import { Controller, Delete, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import type { Env } from '../config/env.schema';
import { GoogleOauthService } from './google-oauth.service';

// HttpOnly cookie that binds the Google connect flow to the browser that started it.
const OAUTH_STATE_COOKIE = 'gsc_oauth_state';
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60 * 1000;

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
  async start(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { authorizationUrl, stateNonce } = await this.googleOauthService.buildAuthorizationUrl(
      projectId,
      user.sub,
    );
    response.cookie(OAUTH_STATE_COOKIE, stateNonce, {
      ...this.stateCookieOptions(),
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
    });
    return { authorizationUrl };
  }

  @Get('google/oauth/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const baseUrl = this.integrationRedirectUrl();
    const stateCookie = request.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    // The flow is single-use: drop the binding cookie regardless of outcome.
    response.clearCookie(OAUTH_STATE_COOKIE, this.stateCookieOptions());

    if (error) {
      response.redirect(`${baseUrl}?google=error&reason=${encodeURIComponent(error)}`);
      return;
    }

    try {
      await this.googleOauthService.completeCallback({
        code: code ?? '',
        state: state ?? '',
        stateCookie,
      });
    } catch {
      response.redirect(`${baseUrl}?google=error&reason=invalid_state`);
      return;
    }
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

  private stateCookieOptions(): CookieOptions {
    const configuredDomain = this.configService.get('COOKIE_DOMAIN', { infer: true }).trim();
    const normalizedDomain = configuredDomain.toLowerCase();
    const domain =
      !configuredDomain ||
      normalizedDomain === 'localhost' ||
      normalizedDomain === '127.0.0.1' ||
      normalizedDomain === '::1'
        ? undefined
        : configuredDomain;
    return {
      domain,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.configService.get('COOKIE_SECURE', { infer: true }),
    };
  }

  private integrationRedirectUrl(): string {
    const appUrl = this.configService.get('APP_URL', { infer: true });
    return new URL('/settings/integrations', appUrl).toString();
  }
}
