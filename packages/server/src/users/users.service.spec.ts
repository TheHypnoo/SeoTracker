import { describe, expect, it, jest } from '@jest/globals';
import { UsersService } from './users.service';

function selectLimitRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function selectOrderRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function insertReturning(rows: unknown[] = []) {
  return {
    values: jest.fn().mockReturnValue({
      onConflictDoUpdate: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe('usersService', () => {
  it('normalizes email lookups before querying', async () => {
    const db = {
      select: jest.fn().mockReturnValue(selectLimitRows([{ id: 'user-1' }])),
    };
    const service = new UsersService(db as never);

    await expect(service.findByEmail('  USER@EXAMPLE.COM  ')).resolves.toStrictEqual([
      { id: 'user-1' },
    ]);

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('creates default preferences with the first available project as active project', async () => {
    const db = {
      insert: jest.fn().mockReturnValue(insertReturning()),
      select: jest
        .fn()
        .mockReturnValueOnce(selectLimitRows([]))
        .mockReturnValueOnce(selectLimitRows([{ id: 'project-1' }])),
    };
    const service = new UsersService(db as never);

    const preferences = await service.getPreferences('user-1');

    expect(preferences).toStrictEqual({
      activeProjectId: 'project-1',
      emailOnAuditCompleted: true,
      emailOnAuditRegression: true,
      emailOnCriticalIssues: true,
      userId: 'user-1',
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('keeps a requested active project only when the user is a member', async () => {
    const db = {
      insert: jest.fn().mockReturnValue(
        insertReturning([
          {
            activeProjectId: 'project-2',
            emailOnAuditCompleted: false,
            emailOnAuditRegression: true,
            emailOnCriticalIssues: false,
            userId: 'user-1',
          },
        ]),
      ),
      select: jest
        .fn()
        .mockReturnValueOnce(
          selectLimitRows([
            {
              activeProjectId: 'project-1',
              emailOnAuditCompleted: true,
              emailOnAuditRegression: true,
              emailOnCriticalIssues: true,
              userId: 'user-1',
            },
          ]),
        )
        .mockReturnValueOnce(selectOrderRows([{ projectId: 'project-1' }]))
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ projectId: 'project-1' }]),
          }),
        })
        .mockReturnValueOnce(selectOrderRows([{ projectId: 'project-1' }]))
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ projectId: 'project-2' }]),
          }),
        }),
    };
    const service = new UsersService(db as never);

    const preferences = await service.updatePreferences('user-1', {
      activeProjectId: 'project-2',
      emailOnAuditCompleted: false,
      emailOnCriticalIssues: false,
    });

    expect(preferences).toStrictEqual({
      activeProjectId: 'project-2',
      emailOnAuditCompleted: false,
      emailOnAuditRegression: true,
      emailOnCriticalIssues: false,
      userId: 'user-1',
    });
  });
});
