import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../database/database.constants';
import { OnboardingService } from './onboarding.service';
import { ProjectsService } from './projects.service';

type DbMock = {
  insert: jest.Mock;
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
};

function makeDb(): DbMock {
  return {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
  };
}

describe('OnboardingService', () => {
  let service: OnboardingService;
  let db: DbMock;
  let projects: { createProject: jest.Mock };

  beforeEach(async () => {
    db = makeDb();
    projects = {
      createProject: jest.fn().mockResolvedValue({ id: 'project-1', name: 'whatever' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: DRIZZLE, useValue: db },
        { provide: ProjectsService, useValue: projects },
      ],
    }).compile();

    service = moduleRef.get(OnboardingService);
  });

  it("creates a default project named after the user's name", async () => {
    await service.bootstrapNewAccount({ userId: 'u-1', name: 'Alice' });

    expect(projects.createProject).toHaveBeenCalledWith('u-1', "Alice's project");
  });

  it('falls back to "Mi proyecto" when name is null/empty/whitespace', async () => {
    await service.bootstrapNewAccount({ userId: 'u-1', name: null });
    expect(projects.createProject).toHaveBeenLastCalledWith('u-1', 'Mi proyecto');

    projects.createProject.mockClear();
    await service.bootstrapNewAccount({ userId: 'u-1', name: '   ' });
    expect(projects.createProject).toHaveBeenLastCalledWith('u-1', 'Mi proyecto');
  });

  it('upserts user_preferences with the new project as activeProjectId', async () => {
    await service.bootstrapNewAccount({ userId: 'u-1', name: 'Alice' });

    expect(db.values).toHaveBeenCalledWith({ userId: 'u-1', activeProjectId: 'project-1' });
    expect(db.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ activeProjectId: 'project-1' }),
      }),
    );
  });

  it('propagates createProject failures so the emitter caller can react', async () => {
    projects.createProject.mockRejectedValueOnce(new Error('db down'));

    await expect(service.bootstrapNewAccount({ userId: 'u-1', name: 'Alice' })).rejects.toThrow(
      'db down',
    );
  });
});
