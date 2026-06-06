import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@seotracker/shared-types';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { assertPresent } from '../common/utils/assert';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { googleOauthConnections } from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { GOOGLE_OAUTH_AUTH_URL, GOOGLE_OAUTH_SCOPE } from './google-oauth.constants';
import { GoogleOauthClient } from './google-oauth.client';
import { GoogleOauthStateService } from './google-oauth-state.service';
import { TokenEncryptionService } from './token-encryption.service';

interface GoogleOauthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
}

@Injectable()
export class GoogleOauthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly projectsService: ProjectsService,
    private readonly stateService: GoogleOauthStateService,
    private readonly oauthClient: GoogleOauthClient,
    private readonly tokenEncryptionService: TokenEncryptionService,
  ) {}

  async buildAuthorizationUrl(projectId: string, userId: string) {
    await this.projectsService.assertPermission(projectId, userId, Permission.OUTBOUND_WRITE);
    const config = this.requireConfig();
    const state = this.stateService.create(
      { projectId, userId },
      this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
    );
    const url = new URL(GOOGLE_OAUTH_AUTH_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ['openid', 'email', GOOGLE_OAUTH_SCOPE].join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);

    return { authorizationUrl: url.toString() };
  }

  async completeCallback(input: { code: string; state: string }) {
    if (!input.code) {
      throw new BadRequestException('Missing OAuth code');
    }
    if (!input.state) {
      throw new BadRequestException('Missing OAuth state');
    }

    const config = this.requireConfig();
    const state = this.stateService.verify(
      input.state,
      this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
    );
    await this.projectsService.assertPermission(
      state.projectId,
      state.userId,
      Permission.OUTBOUND_WRITE,
    );

    const tokens = await this.oauthClient.exchangeCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code: input.code,
      redirectUri: config.redirectUri,
    });
    const userInfo = await this.oauthClient.getUserInfo(tokens.access_token);
    const googleAccountEmail = userInfo.email?.toLowerCase().trim();
    if (!googleAccountEmail) {
      throw new BadGatewayException('Google userinfo response did not include an email');
    }

    const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [GOOGLE_OAUTH_SCOPE];
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const encryptedAccessToken = this.tokenEncryptionService.encrypt(
      tokens.access_token,
      config.tokenEncryptionKey,
    );
    const encryptedRefreshToken = tokens.refresh_token
      ? this.tokenEncryptionService.encrypt(tokens.refresh_token, config.tokenEncryptionKey)
      : null;

    const existing = await this.findActiveConnectionByEmail(state.projectId, googleAccountEmail);
    if (existing && !encryptedRefreshToken) {
      const [updated] = await this.db
        .update(googleOauthConnections)
        .set({
          accessTokenEncrypted: encryptedAccessToken,
          expiresAt,
          scopes,
          updatedAt: new Date(),
        })
        .where(eq(googleOauthConnections.id, existing.id))
        .returning();
      return this.toResponse(assertPresent(updated, 'Google OAuth update did not return a row'));
    }

    if (existing) {
      const [updated] = await this.db
        .update(googleOauthConnections)
        .set({
          accessTokenEncrypted: encryptedAccessToken,
          expiresAt,
          refreshTokenEncrypted: encryptedRefreshToken,
          scopes,
          updatedAt: new Date(),
        })
        .where(eq(googleOauthConnections.id, existing.id))
        .returning();
      return this.toResponse(assertPresent(updated, 'Google OAuth update did not return a row'));
    }

    const [created] = await this.db
      .insert(googleOauthConnections)
      .values({
        projectId: state.projectId,
        connectedByUserId: state.userId,
        googleAccountEmail,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        scopes,
        expiresAt,
      })
      .returning();

    return this.toResponse(assertPresent(created, 'Google OAuth creation did not return a row'));
  }

  async listConnections(projectId: string, userId: string) {
    await this.projectsService.assertPermission(projectId, userId, Permission.OUTBOUND_READ);
    const rows = await this.db
      .select()
      .from(googleOauthConnections)
      .where(
        and(
          eq(googleOauthConnections.projectId, projectId),
          isNull(googleOauthConnections.revokedAt),
        ),
      )
      .orderBy(desc(googleOauthConnections.createdAt));
    return rows.map((row) => this.toResponse(row));
  }

  async revokeConnection(projectId: string, connectionId: string, userId: string) {
    await this.projectsService.assertPermission(projectId, userId, Permission.OUTBOUND_WRITE);
    await this.db
      .update(googleOauthConnections)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(googleOauthConnections.id, connectionId),
          eq(googleOauthConnections.projectId, projectId),
          isNull(googleOauthConnections.revokedAt),
        ),
      );
    return { success: true };
  }

  async getValidAccessToken(projectId: string, connectionId: string) {
    const config = this.requireConfig();
    const connection = await this.findActiveConnection(projectId, connectionId);
    if (!connection) {
      throw new BadRequestException('Google OAuth connection not found');
    }

    if (!this.shouldRefresh(connection.expiresAt)) {
      return {
        accessToken: this.tokenEncryptionService.decrypt(
          connection.accessTokenEncrypted,
          config.tokenEncryptionKey,
        ),
        connection: this.toResponse(connection),
      };
    }

    if (!connection.refreshTokenEncrypted) {
      throw new BadRequestException('Google OAuth connection cannot be refreshed');
    }

    const refreshToken = this.tokenEncryptionService.decrypt(
      connection.refreshTokenEncrypted,
      config.tokenEncryptionKey,
    );
    const refreshed = await this.oauthClient.refreshAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    const accessTokenEncrypted = this.tokenEncryptionService.encrypt(
      refreshed.access_token,
      config.tokenEncryptionKey,
    );
    const refreshTokenEncrypted = refreshed.refresh_token
      ? this.tokenEncryptionService.encrypt(refreshed.refresh_token, config.tokenEncryptionKey)
      : connection.refreshTokenEncrypted;
    const scopes = refreshed.scope?.split(/\s+/).filter(Boolean) ?? connection.scopes;
    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : connection.expiresAt;

    const [updated] = await this.db
      .update(googleOauthConnections)
      .set({
        accessTokenEncrypted,
        expiresAt,
        refreshTokenEncrypted,
        scopes,
        updatedAt: new Date(),
      })
      .where(eq(googleOauthConnections.id, connection.id))
      .returning();

    return {
      accessToken: refreshed.access_token,
      connection: this.toResponse(
        assertPresent(updated, 'Google OAuth refresh did not return a row'),
      ),
    };
  }

  private async findActiveConnectionByEmail(projectId: string, googleAccountEmail: string) {
    const [row] = await this.db
      .select()
      .from(googleOauthConnections)
      .where(
        and(
          eq(googleOauthConnections.projectId, projectId),
          eq(googleOauthConnections.googleAccountEmail, googleAccountEmail),
          isNull(googleOauthConnections.revokedAt),
        ),
      )
      .limit(1);
    return row;
  }

  private async findActiveConnection(projectId: string, connectionId: string) {
    const [row] = await this.db
      .select()
      .from(googleOauthConnections)
      .where(
        and(
          eq(googleOauthConnections.id, connectionId),
          eq(googleOauthConnections.projectId, projectId),
          isNull(googleOauthConnections.revokedAt),
        ),
      )
      .limit(1);
    return row;
  }

  private shouldRefresh(expiresAt: Date | null): boolean {
    if (!expiresAt) return false;
    const refreshSkewMs = 60_000;
    return expiresAt.getTime() - refreshSkewMs <= Date.now();
  }

  private requireConfig(): GoogleOauthConfig {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET', { infer: true });
    const redirectUri = this.configService.get('GOOGLE_OAUTH_REDIRECT_URI', { infer: true });
    const tokenEncryptionKey = this.configService.get('GOOGLE_TOKEN_ENCRYPTION_KEY', {
      infer: true,
    });

    if (!clientId || !clientSecret || !redirectUri || !tokenEncryptionKey) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    return { clientId, clientSecret, redirectUri, tokenEncryptionKey };
  }

  private toResponse(row: typeof googleOauthConnections.$inferSelect) {
    return {
      id: row.id,
      projectId: row.projectId,
      connectedByUserId: row.connectedByUserId,
      googleAccountEmail: row.googleAccountEmail,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
