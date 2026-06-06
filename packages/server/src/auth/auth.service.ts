import {
  ConflictException,
  HttpException,
  HttpStatus,
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
import type IORedis from 'ioredis';

import { assertPresent } from '../common/utils/assert';
import { NotificationsService } from '../notifications/notifications.service';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { passwordResetTokens, refreshTokens, users } from '../database/schema';
import { hashToken, randomToken, safeEqual } from '../common/utils/security';
import { withTimeout } from '../common/utils/with-timeout';
import { USER_REGISTERED_EVENT, type UserRegisteredEvent } from '../projects/onboarding.service';
import { REDIS_CONNECTION } from '../queue/queue.constants';
import { UsersService } from '../users/users.service';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from './jwt.constants';

// Per-account brute-force / credential-stuffing brake. The per-IP throttle on
// /auth/login (5/min) can't stop an attacker rotating IPs against one account,
// so we additionally count failures per email in Redis and lock the account
// with an EXPONENTIAL, self-expiring backoff. Recovery never requires support:
// every lock lifts on its own, and past a high strike count we email the owner
// a one-click reset link (the owner — not an attacker who only knows the email —
// controls that mailbox, so this can't be weaponized into a permanent lockout).
//
// A CAPTCHA / proof-of-work challenge (e.g. Cap, https://trycap.dev) is the
// planned next layer: shown after a few failures it distinguishes humans from
// bots, so a legitimate user is never blocked. Left as a future enhancement.
const LOGIN_LOCK_THRESHOLD = 5; // failures within the window before the first lock
const LOGIN_BASE_LOCK_SECONDS = 60; // first lock; doubles for each extra strike
const LOGIN_MAX_LOCK_SECONDS = 30 * 60; // hard cap on a single lock duration
const LOGIN_STRIKE_WINDOW_SECONDS = 60 * 60; // how long strikes are remembered
const LOGIN_ALERT_STRIKES = 8; // strike count at which the owner is emailed an unlock link
// Redis is only a brute-force brake, never the primary credential gate, so we
// cap how long a login may wait on it and fail open if it is slow/unreachable.
const LOGIN_LOCKOUT_REDIS_TIMEOUT_MS = 1000;

// A constant decoy hash so login spends roughly the same time whether or not the
// email exists, removing the user-enumeration timing oracle (a missing account
// would otherwise return before the ~tens-of-ms Argon2 verify). Computed once.
let decoyHashPromise: Promise<string> | undefined;
function decoyPasswordHash(): Promise<string> {
  decoyHashPromise ??= hash('decoy-password-never-used-for-authentication');
  return decoyHashPromise;
}

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
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
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

    await this.assertNotLockedOut(normalizedEmail);

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Always run a hash verify — against a decoy hash for unknown emails — so the
    // response time doesn't reveal whether the account exists.
    const passwordHash = user?.passwordHash ?? (await decoyPasswordHash());
    const validPassword = await verify(passwordHash, input.password);

    if (!user || !validPassword) {
      await this.recordLoginFailure(normalizedEmail, user ?? null);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.clearLoginFailures(normalizedEmail);

    return this.issueSession({ id: user.id, email: user.email, name: user.name }, response);
  }

  private loginStrikeKey(email: string): string {
    return `auth:login:fail:${email}`;
  }

  private loginLockKey(email: string): string {
    return `auth:login:lock:${email}`;
  }

  private withRedisTimeout<T>(promise: Promise<T>): Promise<T> {
    return withTimeout(promise, 'login-lockout', LOGIN_LOCKOUT_REDIS_TIMEOUT_MS);
  }

  /**
   * Reject the login while the account is in an active backoff lock, independent
   * of source IP. Defeats distributed credential stuffing the per-IP throttle
   * can't. Fails open if Redis is unreachable (the throttle + Argon2 still gate
   * logins — we must not lock everyone out on a Redis outage).
   */
  private async assertNotLockedOut(email: string): Promise<void> {
    let locked: string | null;
    try {
      locked = await this.withRedisTimeout(this.redis.get(this.loginLockKey(email)));
    } catch (error) {
      this.logger.warn(`Login lockout check skipped (Redis unavailable): ${String(error)}`);
      return;
    }

    if (locked) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Count a failed attempt and, once the threshold is crossed, lock the account
   * for an exponentially-growing but capped, self-expiring window. Strikes are
   * remembered for an hour so repeated bursts escalate. At a high strike count
   * the owner (when the email maps to a real account) is emailed a one-click
   * reset link so they can always regain access without contacting support.
   */
  private async recordLoginFailure(
    email: string,
    user: { id: string; email: string; name: string } | null,
  ): Promise<void> {
    const strikeKey = this.loginStrikeKey(email);
    try {
      const strikes = await this.withRedisTimeout(this.redis.incr(strikeKey));
      await this.withRedisTimeout(this.redis.expire(strikeKey, LOGIN_STRIKE_WINDOW_SECONDS));

      if (strikes < LOGIN_LOCK_THRESHOLD) {
        return;
      }

      const exponent = strikes - LOGIN_LOCK_THRESHOLD;
      const lockSeconds = Math.min(LOGIN_BASE_LOCK_SECONDS * 2 ** exponent, LOGIN_MAX_LOCK_SECONDS);
      await this.withRedisTimeout(this.redis.set(this.loginLockKey(email), '1', 'EX', lockSeconds));

      // Email the owner exactly once per escalation (strict equality), and only
      // for a real account so we never email arbitrary addresses on demand.
      if (strikes === LOGIN_ALERT_STRIKES && user) {
        await this.sendLockoutRecoveryEmail(user);
      }
    } catch (error) {
      this.logger.warn(`Could not record login failure (Redis unavailable): ${String(error)}`);
    }
  }

  private async clearLoginFailures(email: string): Promise<void> {
    try {
      await this.withRedisTimeout(
        this.redis.del(this.loginStrikeKey(email), this.loginLockKey(email)),
      );
    } catch (error) {
      this.logger.warn(`Could not clear login failures (Redis unavailable): ${String(error)}`);
    }
  }

  private async sendLockoutRecoveryEmail(user: {
    id: string;
    email: string;
    name: string;
  }): Promise<void> {
    const ttlMinutes = this.configService.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    const rawToken = await this.createPasswordResetToken(user.id);
    const resetUrl = `${this.configService.get('APP_URL', { infer: true })}/reset-password/${rawToken}`;

    void this.notificationsService
      .enqueueEmailDelivery({
        notificationType: 'PASSWORD_RESET',
        to: user.email,
        userId: user.id,
        subject: 'SEOTracker - Actividad de inicio de sesión sospechosa',
        text: `Hola ${user.name}.\n\nHemos detectado muchos intentos de inicio de sesión fallidos en tu cuenta. Si no fuiste tú, tu cuenta sigue protegida y no necesitas hacer nada.\n\nSi eres tú y no puedes acceder, restablece tu contraseña para recuperar el acceso de inmediato:\n${resetUrl}\n\nEste enlace caduca en ${ttlMinutes} minutos.`,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to send lockout recovery email to user ${user.id}: ${String(error)}`,
        );
      });
  }

  /**
   * Issue a single-use password reset token: invalidate any previously-issued
   * unused tokens for the user, then persist the hash of a fresh one. Returns the
   * raw token for inclusion in the reset link.
   */
  private async createPasswordResetToken(userId: string): Promise<string> {
    const ttlMinutes = this.configService.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    const rawToken = randomToken(32);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

    await this.db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    return rawToken;
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
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: [JWT_ALGORITHM],
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
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: [JWT_ALGORITHM],
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
      const rawToken = await this.createPasswordResetToken(user.id);
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

    // The user just proved ownership via the reset link, so clear any active
    // brute-force strike/lock to let them sign in immediately (the lock is keyed
    // by email). Outside the transaction and fail-open — a Redis hiccup here must
    // not fail the password reset itself.
    const [resetUser] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, resetRecord.userId))
      .limit(1);
    if (resetUser) {
      await this.clearLoginFailures(resetUser.email.toLowerCase().trim());
    }

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
        expiresIn: this.configService.get('JWT_ACCESS_TTL', { infer: true }),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: JWT_ALGORITHM,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, jti },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: `${this.configService.get('JWT_REFRESH_TTL_DAYS', { infer: true })}d`,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: JWT_ALGORITHM,
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
    const secure = this.configService.get('COOKIE_SECURE', { infer: true });
    const domain = this.resolveCookieDomain();

    // Match the attributes used when setting the cookies. Browsers may refuse
    // to clear a Secure/SameSite cookie if the deletion Set-Cookie header omits
    // those attributes, leaving a revoked refresh token alive on the client.
    const baseOptions = { path: '/', sameSite: 'lax' as const, secure };

    response.clearCookie(refreshCookieName, baseOptions);
    response.clearCookie(csrfCookieName, baseOptions);

    if (domain) {
      response.clearCookie(refreshCookieName, { ...baseOptions, domain });
      response.clearCookie(csrfCookieName, { ...baseOptions, domain });
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
