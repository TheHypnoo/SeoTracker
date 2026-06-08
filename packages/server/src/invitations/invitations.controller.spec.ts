import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

const USER = { sub: 'u-1' };

describe('invitationsController', () => {
  let controller: InvitationsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      createInvite: jest.fn().mockResolvedValue('created'),
      acceptInvite: jest.fn().mockResolvedValue('accepted'),
      listProjectInvites: jest.fn().mockResolvedValue('invites'),
      revokeInvite: jest.fn().mockResolvedValue('revoked'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(InvitationsController);
  });

  it('createInvite delegates to invitationsService.createInvite', () => {
    void controller.createInvite(USER, 'p1', { email: 'a@b.test' } as never);
    expect(service.createInvite).toHaveBeenCalledWith('p1', 'u-1', { email: 'a@b.test' });
  });

  it('accept delegates to invitationsService.acceptInvite', () => {
    void controller.accept(USER, { token: 't1' } as never);
    expect(service.acceptInvite).toHaveBeenCalledWith('u-1', { token: 't1' });
  });

  it('listProjectInvites delegates to invitationsService.listProjectInvites', () => {
    void controller.listProjectInvites(USER, 'p1');
    expect(service.listProjectInvites).toHaveBeenCalledWith('p1', 'u-1');
  });

  it('revokeInvite delegates to invitationsService.revokeInvite', () => {
    void controller.revokeInvite(USER, 'p1', 'i1');
    expect(service.revokeInvite).toHaveBeenCalledWith('p1', 'i1', 'u-1');
  });
});
