import { BadGatewayException, Injectable } from '@nestjs/common';

import { GOOGLE_OAUTH_TOKEN_URL, GOOGLE_USERINFO_URL } from './google-oauth.constants';

export interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GoogleUserInfoResponse {
  email?: string;
  sub?: string;
}

@Injectable()
export class GoogleOauthClient {
  async exchangeCode(input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new BadGatewayException(`Google OAuth token exchange failed (${response.status})`);
    }

    const payload = (await response.json()) as GoogleTokenResponse;
    if (!payload.access_token) {
      throw new BadGatewayException('Google OAuth token response did not include an access token');
    }

    return payload;
  }

  async getUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new BadGatewayException(`Google userinfo request failed (${response.status})`);
    }

    return (await response.json()) as GoogleUserInfoResponse;
  }

  async refreshAccessToken(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new BadGatewayException(`Google OAuth token refresh failed (${response.status})`);
    }

    const payload = (await response.json()) as GoogleTokenResponse;
    if (!payload.access_token) {
      throw new BadGatewayException(
        'Google OAuth refresh response did not include an access token',
      );
    }

    return payload;
  }
}
