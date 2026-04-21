import { Test } from '@nestjs/testing';

import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

const USER = { sub: 'u-1' };

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      createProject: jest.fn().mockResolvedValue('created'),
      listForUser: jest.fn().mockResolvedValue([]),
      getProjectForUser: jest.fn().mockResolvedValue('one'),
      getDashboard: jest.fn().mockResolvedValue('dash'),
      listMembers: jest.fn().mockResolvedValue([]),
      removeMember: jest.fn().mockResolvedValue('ok'),
      updateMemberPermissions: jest.fn().mockResolvedValue('updated'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProjectsController);
  });

  it('create passes only the name (and current user)', () => {
    void controller.create(USER, { name: 'Acme' } as never);
    expect(service.createProject).toHaveBeenCalledWith('u-1', 'Acme');
  });

  it('list / getById / dashboard / members delegate', () => {
    void controller.list(USER);
    void controller.getById(USER, 'p1');
    void controller.dashboard(USER, 'p1');
    void controller.members(USER, 'p1');
    expect(service.listForUser).toHaveBeenCalledWith('u-1');
    expect(service.getProjectForUser).toHaveBeenCalledWith('p1', 'u-1');
    expect(service.getDashboard).toHaveBeenCalledWith('p1', 'u-1');
    expect(service.listMembers).toHaveBeenCalledWith('p1', 'u-1');
  });

  it('removeMember passes (projectId, targetUserId, actorUserId)', () => {
    void controller.removeMember(USER, 'p1', 'u-other');
    expect(service.removeMember).toHaveBeenCalledWith('p1', 'u-other', 'u-1');
  });

  it('updateMemberPermissions delegates with body', () => {
    void controller.updateMemberPermissions(USER, 'p1', 'u-other', {
      role: 'VIEWER',
      extraPermissions: ['audit.run'],
      revokedPermissions: [],
    } as never);
    expect(service.updateMemberPermissions).toHaveBeenCalledWith('p1', 'u-other', 'u-1', {
      role: 'VIEWER',
      extraPermissions: ['audit.run'],
      revokedPermissions: [],
    });
  });
});
