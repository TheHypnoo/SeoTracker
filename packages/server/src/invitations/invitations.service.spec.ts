import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import { InvitationsService } from './invitations.service';

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

describe('InvitationsService', () => {
  let service: InvitationsService;
  let db: DbMock;
  let projects: {
    assertOwner: jest.Mock;
    addMember: jest.Mock;
    assertPermission: jest.Mock;
    validateOverrides: jest.Mock;
  };
  let notifications: { enqueueEmailDelivery: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    projects = {
      assertOwner: jest.fn().mockResolvedValue({}),
      addMember: jest.fn().mockResolvedValue(undefined),
      assertPermission: jest.fn().mockResolvedValue(undefined),
      validateOverrides: jest.fn(),
    };
    notifications = { enqueueEmailDelivery: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn().mockReturnValue('http://localhost:3000') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: DRIZZLE, useValue: db },
        { provide: ProjectsService, useValue: projects },
        { provide: NotificationsService, useValue: notifications },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(InvitationsService);
  });

  describe('createInvite', () => {
    it('asserts owner, persists with hashed token (NOT plaintext) and emails the invitee', async () => {
      db.returning.mockResolvedValueOnce([
        {
          id: 'i1',
          projectId: 'p1',
          email: 'mate@x.test',
          role: Role.MEMBER,
          expiresAt: new Date(),
        },
      ]);

      const out = await service.createInvite('p1', 'u-owner', { email: 'Mate@X.Test' });

      expect(projects.assertPermission).toHaveBeenCalledWith('p1', 'u-owner', expect.any(String));
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          email: 'mate@x.test', // normalized
          role: Role.MEMBER, // default when none supplied
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      // The plaintext token must surface to the caller (so the API can email
      // the invite link), but only the HASH is stored.
      const firstCall = db.values.mock.calls[0];
      if (!firstCall) throw new Error('expected db.values to have been called');
      const insertedHash = (firstCall[0] as { tokenHash: string }).tokenHash;
      expect(out.token).toBeTruthy();
      expect(out.token).not.toBe(insertedHash); // plaintext != hash
      expect(notifications.enqueueEmailDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationType: 'PROJECT_INVITE',
          projectId: 'p1',
          to: 'mate@x.test',
          subject: expect.stringContaining('SEOTracker'),
          text: expect.stringContaining(`http://localhost:3000/invite/${out.token}`),
        }),
      );
    });

    it('uses the explicit non-owner role when provided (does NOT default to MEMBER)', async () => {
      db.returning.mockResolvedValueOnce([
        { id: 'i1', projectId: 'p1', email: 'a@b.c', role: Role.VIEWER, expiresAt: new Date() },
      ]);

      await service.createInvite('p1', 'u-owner', { email: 'a@b.c', role: Role.VIEWER });

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ role: Role.VIEWER }));
    });

    it('rejects OWNER invites because ownership transfer is not supported here', async () => {
      await expect(
        service.createInvite('p1', 'u-owner', { email: 'a@b.c', role: Role.OWNER }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('throws NotFoundException when the token is unknown / expired / used', async () => {
      db.where.mockReturnValueOnce(thenable([])); // invite lookup empty

      await expect(service.acceptInvite('u1', { token: 'bad' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'i1', projectId: 'p1', email: 'mate@x.test', role: Role.MEMBER }]),
        )
        .mockReturnValueOnce(thenable([])); // user lookup empty

      await expect(service.acceptInvite('u1', { token: 'good' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user email does not match the invite', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([{ id: 'i1', projectId: 'p1', email: 'mate@x.test', role: Role.MEMBER }]),
        )
        .mockReturnValueOnce(thenable([{ id: 'u1', email: 'someone-else@x.test' }]));

      await expect(service.acceptInvite('u1', { token: 'good' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('on match, adds the member with the invited role and marks invite acceptedAt', async () => {
      db.where
        .mockReturnValueOnce(
          thenable([
            {
              id: 'i1',
              projectId: 'p1',
              email: 'mate@x.test',
              role: Role.MEMBER,
              extraPermissions: [],
              revokedPermissions: [],
            },
          ]),
        )
        .mockReturnValueOnce(thenable([{ id: 'u1', email: 'Mate@X.Test' }])) // case-insensitive match
        // update.set.where(...) resolves
        .mockResolvedValueOnce(undefined);

      const out = await service.acceptInvite('u1', { token: 'good' });

      expect(projects.addMember).toHaveBeenCalledWith('p1', 'u1', Role.MEMBER, [], []);
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ acceptedAt: expect.any(Date) }),
      );
      expect(out).toStrictEqual({ success: true });
    });
  });
});
