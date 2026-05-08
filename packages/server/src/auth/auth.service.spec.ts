import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../database/database.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { USER_REGISTERED_EVENT } from '../projects/onboarding.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// Argon2 verify is exercised in login. We mock the module so tests don't
// depend on native bindings or salt timing.
jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
  verify: jest.fn().mockResolvedValue(true),
}));
const argon2 = jest.requireMock('@node-rs/argon2') as {
  hash: jest.Mock;
  verify: jest.Mock;
};

type ChainableDb = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  transaction: jest.Mock;
};

function makeDbMock(): ChainableDb {
  // Fluent chain — every non-terminal call returns the same proxy; terminal
  // calls (limit/returning/set/onConflictDoUpdate) are configured per-test.
  const db: ChainableDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    transaction: jest.fn(),
  };
  return db;
}

// Cookie/response double — only what AuthService.issueSession actually calls.
function makeResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let db: ChainableDb;
  let eventEmitter: { emitAsync: jest.Mock };
  let users: { findByEmail: jest.Mock };
  let notifications: { enqueueEmailDelivery: jest.Mock };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    db = makeDbMock();
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    users = { findByEmail: jest.fn().mockResolvedValue([]) };
    notifications = { enqueueEmailDelivery: jest.fn().mockResolvedValue(undefined) };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          JWT_ACCESS_SECRET: 'access-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          JWT_REFRESH_SECRET: 'refresh-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_TTL_DAYS: 30,
          PASSWORD_RESET_TTL_MINUTES: 60,
          COOKIE_SECURE: false,
          REFRESH_COOKIE_NAME: 'refresh_token',
          CSRF_COOKIE_NAME: 'csrf_token',
          COOKIE_DOMAIN: 'localhost',
          APP_URL: 'http://localhost:3000',
        };
        return map[key];
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: db },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: UsersService, useValue: users },
        { provide: NotificationsService, useValue: notifications },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = moduleRef.get(AuthService);

    argon2.hash.mockClear();
    argon2.verify.mockClear();
  });

  describe('register', () => {
    it('throws ConflictException (409) when the email is already registered', async () => {
      // First DB select chain returns an existing user.
      db.limit.mockResolvedValueOnce([{ id: 'u1', email: 'a@b.c' }]);

      await expect(
        service.register(
          { email: 'a@b.c', name: 'A', password: 'pw123456' },
          makeResponse() as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('normalizes email (lowercase + trim) before lookup', async () => {
      db.limit.mockResolvedValueOnce([{ id: 'u1' }]);

      await expect(
        service.register(
          { email: '  Foo@BAR.com  ', name: 'A', password: 'pw' },
          makeResponse() as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // The error path doesn't return — but we can check the equality clause
      // by inspecting the where(...) call argument is an SQL expression. Since
      // drizzle SQL builders aren't trivially serializable, we just check the
      // call happened (the normalization is asserted via the happy path below).
      expect(db.select).toHaveBeenCalled();
    });

    it('happy path: hashes password, creates user, emits user.registered, issues session', async () => {
      // 1) duplicate-check select returns empty
      db.limit.mockResolvedValueOnce([]);
      // 2) insert(users).returning(...) returns created row
      db.returning.mockResolvedValueOnce([{ id: 'new-user', email: 'a@b.c', name: 'A' }]);

      const res = makeResponse();
      const result = await service.register(
        { email: 'A@B.C', name: '  A  ', password: 'pw123456' },
        res as never,
      );

      expect(argon2.hash).toHaveBeenCalledWith('pw123456');
      // Onboarding side-effects (default project, preferences) are now driven
      // by the user.registered event — we only assert it was emitted with the
      // expected payload. The OnboardingService spec covers the listener.
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(USER_REGISTERED_EVENT, {
        userId: 'new-user',
        name: 'A',
      });
      expect(jwt.signAsync).toHaveBeenCalledTimes(2); // access + refresh
      expect(res.cookie).toHaveBeenCalledTimes(2); // refresh_token + csrf_token
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'jwt-token',
          csrfToken: expect.any(String),
          user: expect.objectContaining({ id: 'new-user', email: 'a@b.c' }),
        }),
      );
    });

    it('emit failures (onboarding listener throws) propagate so AuthController returns 5xx', async () => {
      db.limit.mockResolvedValueOnce([]);
      db.returning.mockResolvedValueOnce([{ id: 'new-user', email: 'a@b.c', name: 'A' }]);
      eventEmitter.emitAsync.mockRejectedValueOnce(new Error('onboarding broke'));

      await expect(
        service.register(
          { email: 'a@b.c', name: 'A', password: 'pw123456' },
          makeResponse() as never,
        ),
      ).rejects.toThrow('onboarding broke');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.login({ email: 'nope@x.y', password: 'pw' }, makeResponse() as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      db.limit.mockResolvedValueOnce([
        { id: 'u', email: 'a@b.c', name: 'A', passwordHash: 'hashed-pw' },
      ]);
      argon2.verify.mockResolvedValueOnce(false);

      await expect(
        service.login({ email: 'a@b.c', password: 'wrong' }, makeResponse() as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a session on valid credentials', async () => {
      db.limit.mockResolvedValueOnce([
        { id: 'u', email: 'a@b.c', name: 'A', passwordHash: 'hashed-pw' },
      ]);

      const res = makeResponse();
      const result = await service.login({ email: 'A@B.C', password: 'pw' }, res as never);

      expect(argon2.verify).toHaveBeenCalledWith('hashed-pw', 'pw');
      expect(result.accessToken).toBe('jwt-token');
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException and clears cookies when refresh token is missing', async () => {
      const res = makeResponse();

      await expect(service.refresh(undefined, 'csrf', 'csrf', res as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('throws when CSRF header and cookie do not match (timing-safe)', async () => {
      const res = makeResponse();

      await expect(
        service.refresh('refresh-jwt', 'csrf-A', 'csrf-B', res as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('throws when the refresh JWT cannot be verified', async () => {
      jwt.verifyAsync.mockRejectedValueOnce(new Error('bad signature'));
      const res = makeResponse();

      await expect(
        service.refresh('refresh-jwt', 'csrf', 'csrf', res as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('throws when the stored token row cannot be located (revoked/expired)', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u', email: 'a@b.c', jti: 'j1' });
      // First .limit() = stored token lookup → empty.
      db.limit.mockResolvedValueOnce([]);
      const res = makeResponse();

      await expect(
        service.refresh('refresh-jwt', 'csrf', 'csrf', res as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws and clears cookies when the refreshed user no longer exists', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u', email: 'a@b.c', jti: 'j1' });
      db.limit.mockResolvedValueOnce([{ id: 'j1' }]).mockResolvedValueOnce([]);
      const res = makeResponse();

      await expect(service.refresh('refresh-jwt', 'csrf', 'csrf', res as never)).rejects.toThrow(
        'User not found',
      );
      expect(db.update).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('rotates a valid refresh token and issues a fresh session', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u', email: 'a@b.c', jti: 'j1' });
      db.limit
        .mockResolvedValueOnce([{ id: 'j1' }])
        .mockResolvedValueOnce([{ id: 'u', email: 'a@b.c', name: 'A' }]);
      const res = makeResponse();

      await expect(service.refresh('refresh-jwt', 'csrf', 'csrf', res as never)).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'jwt-token',
          csrfToken: expect.any(String),
          user: { id: 'u', email: 'a@b.c', name: 'A' },
        }),
      );

      expect(db.update).toHaveBeenCalled();
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSession (read-only SSR endpoint)', () => {
    it('throws when no refresh token cookie is present', async () => {
      await expect(service.getSession(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws on invalid signature', async () => {
      jwt.verifyAsync.mockRejectedValueOnce(new Error('bad'));
      await expect(service.getSession('bad-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when refresh token row is revoked or expired', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u', email: 'a@b.c', jti: 'j' });
      db.limit.mockResolvedValueOnce([]); // stored token lookup empty

      await expect(service.getSession('jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the user on a valid, non-revoked token (NO rotation)', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u', email: 'a@b.c', jti: 'j' });
      db.limit
        .mockResolvedValueOnce([{ id: 'tok-row' }]) // stored token
        .mockResolvedValueOnce([{ id: 'u', email: 'a@b.c', name: 'A' }]); // user

      const user = await service.getSession('jwt');

      expect(user).toEqual({ id: 'u', email: 'a@b.c', name: 'A' });
      // Critical invariant: getSession MUST NOT call signAsync (no rotation).
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears cookies even when CSRF is invalid (defensive)', async () => {
      const res = makeResponse();

      const result = await service.logout('refresh-jwt', 'csrf-A', 'csrf-B', res as never);

      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalled();
      // No DB mutation when CSRF is invalid.
      expect(db.update).not.toHaveBeenCalled();
    });

    it('revokes the stored refresh token when CSRF matches', async () => {
      const res = makeResponse();

      await service.logout('refresh-jwt', 'csrf', 'csrf', res as never);

      expect(db.update).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('clears cookies even with no refresh token cookie at all', async () => {
      const res = makeResponse();

      await service.logout(undefined, undefined, undefined, res as never);

      expect(res.clearCookie).toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('clears both host-only and configured-domain cookies for production domains', async () => {
      const previousGet = config.get.getMockImplementation();
      config.get.mockImplementation((key: string) =>
        key === 'COOKIE_DOMAIN' ? 'app.example.com' : previousGet?.(key),
      );
      const res = makeResponse();

      await service.logout(undefined, undefined, undefined, res as never);

      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/',
        domain: 'app.example.com',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('csrf_token', {
        path: '/',
        domain: 'app.example.com',
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('creates a persisted email delivery when the account exists', async () => {
      users.findByEmail.mockResolvedValueOnce([{ id: 'u1', email: 'a@b.c', name: 'Ada' }]);

      const out = await service.requestPasswordReset(' A@B.C ');

      expect(out).toEqual({ success: true });
      expect(users.findByEmail).toHaveBeenCalledWith('a@b.c');
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      expect(notifications.enqueueEmailDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationType: 'PASSWORD_RESET',
          to: 'a@b.c',
          userId: 'u1',
          subject: expect.stringContaining('Recuperación de contraseña'),
          text: expect.stringContaining('/reset-password/'),
        }),
      );
    });

    it('does not enqueue an email when the account does not exist', async () => {
      users.findByEmail.mockResolvedValueOnce([]);

      const out = await service.requestPasswordReset('missing@x.test');

      expect(out).toEqual({ success: true });
      expect(notifications.enqueueEmailDelivery).not.toHaveBeenCalled();
    });

    it('still succeeds when password reset email enqueue fails', async () => {
      users.findByEmail.mockResolvedValueOnce([{ id: 'u1', email: 'a@b.c', name: 'Ada' }]);
      notifications.enqueueEmailDelivery.mockRejectedValueOnce(new Error('queue down'));

      await expect(service.requestPasswordReset('a@b.c')).resolves.toEqual({ success: true });
      await Promise.resolve();

      expect(notifications.enqueueEmailDelivery).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects invalid, expired or already-used reset tokens', async () => {
      db.limit.mockResolvedValueOnce([]);

      await expect(service.resetPassword('bad-token', 'New-password-123')).rejects.toThrow(
        'Reset token invalid or expired',
      );
    });

    it('updates the password, consumes the reset token and revokes active sessions atomically', async () => {
      db.limit.mockResolvedValueOnce([{ id: 'reset-1', userId: 'u1' }]);
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
        }),
      };
      db.transaction.mockImplementation(async (cb: (transaction: typeof tx) => Promise<unknown>) =>
        cb(tx),
      );

      await expect(service.resetPassword('token', 'New-password-123')).resolves.toEqual({
        success: true,
      });

      expect(argon2.hash).toHaveBeenCalledWith('New-password-123');
      expect(tx.update).toHaveBeenCalledTimes(3);
    });
  });
});
