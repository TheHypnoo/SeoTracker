import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Response } from 'express';

import { assertPresent } from '../common/utils/assert';
import { NotificationsService } from '../notifications/notifications.service';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { passwordResetTokens, refreshTokens, users } from '../database/schema';
import { hashToken, randomToken, safeEqual } from '../common/utils/security';
import { USER_REGISTERED_EVENT, type UserRegisteredEvent } from '../projects/onboarding.service';
import { UsersService } from '../users/users.service';

const ACCESS_TOKEN_TTL = '15m';

/**
 * Authentication service.
 *
 * Issues short-lived access tokens (in-memory on the client) and long-lived refresh tokens
 * (HttpOnly cookie, hashed at rest). Refresh tokens rotate on every use; the previous one is
 * marked revoked to detect replays. State-changing endpoints additionally require a CSRF
 * double-submit token (header value must match a non-HttpOnly cookie value).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new user, provision a default project, persist it as the active project, and
   * issue a session. Throws `UnauthorizedException` if the email is already registered.
   */
  async register(input: { email: string; name: string; password: string }, response: Response) {
    const normalizedEmail = input.email.toLowerCase().trim();

    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const [createdUser] = await this.db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: input.name.trim(),
        passwordHash: await hash(input.password),
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    const savedUser = assertPresent(createdUser, 'User creation did not return a row');

    // Onboarding (default project + active project preference) is owned by
    // ProjectsModule via an OnEvent listener. Using emitAsync + the listener's
    // `promisify: true` means we still await the side-effects synchronously,
    // so the user has a usable activeProjectId by the time issueSession runs.
    const event: UserRegisteredEvent = { userId: savedUser.id, name: savedUser.name };
    await this.eventEmitter.emitAsync(USER_REGISTERED_EVENT, event);

    return this.issueSession(savedUser, response);
  }

  /**
   * Verify credentials with Argon2 and issue a new session.
   * Returns the same generic error for "user not found" and "wrong password" to avoid email enumeration.
   */
  async login(input: { email: string; password: string }, response: Response) {
    const normalizedEmail = input.email.toLowerCase().trim();
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await verify(user.passwordHash, input.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueSession({ id: user.id, email: user.email, name: user.name }, response);
  }

  /**
   * Rotate the refresh token and issue a fresh access/refresh pair. Requires a valid CSRF
   * double-submit token. Old refresh row is marked revoked atomically; reuse of an already
   * revoked token is rejected as a replay attempt. On any failure, session cookies are cleared.
   */
  async refresh(
    refreshToken: string | undefined,
    csrfHeader: string | undefined,
    csrfCookie: string | undefined,
    response: Response,
  ) {
    if (!refreshToken) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Missing refresh token');
    }

    if (!csrfHeader || !csrfCookie || !safeEqual(csrfHeader, csrfCookie)) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Invalid CSRF token');
    }

    let payload: { sub: string; email: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [storedToken] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.id, payload.jti),
          eq(refreshTokens.userId, payload.sub),
          eq(refreshTokens.tokenHash, hashToken(refreshToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!storedToken) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, storedToken.id));

    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('User not found');
    }

    return this.issueSession(user, response);
  }

  /**
   * Read-only session lookup: validates the refresh token cookie WITHOUT
   * rotating it and returns the user. Designed for server-side rendering
   * loaders that run on every navigation — using `refresh()` there would
   * rotate the token (and burn the auth throttle) on every request.
   */
  async getSession(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; email: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [storedToken] = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.id, payload.jti),
          eq(refreshTokens.userId, payload.sub),
          eq(refreshTokens.tokenHash, hashToken(refreshToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Revoke the current refresh token (if CSRF-valid) and clear session cookies. Always returns
   * `{ success: true }` so the client can tear down state regardless of server-side outcome.
   */
  async logout(
    refreshToken: string | undefined,
    csrfHeader: string | undefined,
    csrfCookie: string | undefined,
    response: Response,
  ) {
    const csrfValid = !!csrfHeader && !!csrfCookie && safeEqual(csrfHeader, csrfCookie);

    if (csrfValid && refreshToken) {
      const hashed = hashToken(refreshToken);
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, hashed));
    }

    this.clearSessionCookies(response);

    return { success: true };
  }

  /**
   * Issue a single-use password reset token and send it via email. Always returns
   * `{ success: true }` regardless of whether the email exists, to prevent enumeration.
   */
  async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const ttlMinutes = this.configService.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });

    const [user] = await this.usersService.findByEmail(normalizedEmail);

    if (user) {
      const rawToken = randomToken(32);
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      await this.db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      });

      const resetUrl = `${this.configService.get('APP_URL', { infer: true })}/reset-password/${rawToken}`;

      void this.notificationsService
        .enqueueEmailDelivery({
          notificationType: 'PASSWORD_RESET',
          to: user.email,
          userId: user.id,
          subject: 'SEOTracker - Recuperación de contraseña',
          text: `Hola ${user.name}.\n\nHemos recibido una solicitud para restablecer tu contraseña.\n\nEnlace: ${resetUrl}\n\nEste enlace caduca en ${ttlMinutes} minutos.`,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to send password reset email to user ${user.id}: ${String(error)}`,
          );
        });
    }

    return { success: true };
  }

  /**
   * Consume a reset token and update the password. Atomically: hashes the new password,
   * marks the token used, and revokes every active refresh token for that user (so other
   * devices are signed out). Throws if the token is invalid, expired or already used.
   */
  async resetPassword(token: string, password: string) {
    const [resetRecord] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!resetRecord) {
      throw new UnauthorizedException('Reset token invalid or expired');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await hash(password),
        })
        .where(eq(users.id, resetRecord.userId));

      await tx
        .update(passwordResetTokens)
        .set({
          usedAt: new Date(),
        })
        .where(eq(passwordResetTokens.id, resetRecord.id));

      await tx
        .update(refreshTokens)
        .set({
          revokedAt: new Date(),
        })
        .where(and(eq(refreshTokens.userId, resetRecord.userId), isNull(refreshTokens.revokedAt)));
    });

    return { success: true };
  }

  private async issueSession(
    user: { id: string; email: string; name: string },
    response: Response,
  ) {
    const jti = randomUUID();
    const csrfToken = randomToken(24);
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.configService.get('JWT_ACCESS_TTL', { infer: true }) || ACCESS_TOKEN_TTL,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, jti },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: `${this.configService.get('JWT_REFRESH_TTL_DAYS', { infer: true })}d`,
      },
    );

    const ttlDays = this.configService.get('JWT_REFRESH_TTL_DAYS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.db.insert(refreshTokens).values({
      id: jti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });

    const secure = this.configService.get('COOKIE_SECURE', { infer: true });
    const refreshCookieName = this.configService.get('REFRESH_COOKIE_NAME', {
      infer: true,
    });
    const csrfCookieName = this.configService.get('CSRF_COOKIE_NAME', {
      infer: true,
    });
    const domain = this.resolveCookieDomain();

    response.cookie(refreshCookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/',
    });

    response.cookie(csrfCookieName, csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      domain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      accessToken,
      csrfToken,
      user,
    };
  }

  private clearSessionCookies(response: Response) {
    const refreshCookieName = this.configService.get('REFRESH_COOKIE_NAME', {
      infer: true,
    });
    const csrfCookieName = this.configService.get('CSRF_COOKIE_NAME', {
      infer: true,
    });
    const domain = this.resolveCookieDomain();

    response.clearCookie(refreshCookieName, { path: '/' });
    response.clearCookie(csrfCookieName, { path: '/' });

    if (domain) {
      response.clearCookie(refreshCookieName, { path: '/', domain });
      response.clearCookie(csrfCookieName, { path: '/', domain });
    }
  }

  private resolveCookieDomain() {
    const configuredDomain = this.configService.get('COOKIE_DOMAIN', { infer: true }).trim();
    if (!configuredDomain) {
      return undefined;
    }

    const normalizedDomain = configuredDomain.toLowerCase();
    if (
      normalizedDomain === 'localhost' ||
      normalizedDomain === '127.0.0.1' ||
      normalizedDomain === '::1'
    ) {
      return undefined;
    }

    return configuredDomain;
  }
}
