import { Test } from '@nestjs/testing';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getPreferences: jest.fn().mockResolvedValue({ activeProjectId: 'p1' }),
      updatePreferences: jest.fn().mockResolvedValue({ activeProjectId: 'p2' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  it('getPreferences delegates with current user sub', () => {
    void controller.getPreferences({ sub: 'u-1' });
    expect(service.getPreferences).toHaveBeenCalledWith('u-1');
  });

  it('updatePreferences delegates with body', () => {
    void controller.updatePreferences({ sub: 'u-1' }, { activeProjectId: 'p2' } as never);
    expect(service.updatePreferences).toHaveBeenCalledWith('u-1', { activeProjectId: 'p2' });
  });
});
