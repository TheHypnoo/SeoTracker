import { Test } from '@nestjs/testing';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

const USER = { sub: 'u-1' };

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      createInvite: jest.fn().mockResolvedValue('created'),
      acceptInvite: jest.fn().mockResolvedValue('accepted'),
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
});
