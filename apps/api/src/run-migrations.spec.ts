import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DRIZZLE } from '@seotracker/server';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { runDatabaseMigrations } from './run-migrations';

jest.mock('@seotracker/server', () => ({ DRIZZLE: 'DRIZZLE' }), { virtual: true });
jest.mock<typeof import('node:fs')>('node:fs', () => ({ existsSync: jest.fn() }) as never);
jest.mock<typeof import('drizzle-orm/node-postgres/migrator')>(
  'drizzle-orm/node-postgres/migrator',
  () => ({ migrate: jest.fn() }) as never,
);

const existsSyncMock = jest.mocked(existsSync);
const migrateMock = jest.mocked(migrate);

describe('runDatabaseMigrations', () => {
  const previousDir = process.env.DATABASE_MIGRATIONS_DIR;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DATABASE_MIGRATIONS_DIR;
  });

  afterEach(() => {
    if (previousDir === undefined) {
      delete process.env.DATABASE_MIGRATIONS_DIR;
    } else {
      process.env.DATABASE_MIGRATIONS_DIR = previousDir;
    }
  });

  it('runs migrations from the configured folder when it contains a Drizzle journal', async () => {
    process.env.DATABASE_MIGRATIONS_DIR = '/custom/drizzle';
    existsSyncMock.mockImplementation((candidatePath) =>
      String(candidatePath).startsWith('/custom/drizzle'),
    );
    const drizzle = { db: true };
    const app = { get: jest.fn(() => drizzle) };

    await runDatabaseMigrations(app as never);

    expect(existsSyncMock).toHaveBeenCalledWith(resolve('/custom/drizzle', 'meta/_journal.json'));
    expect(app.get).toHaveBeenCalledWith(DRIZZLE);
    expect(migrateMock).toHaveBeenCalledWith(drizzle, { migrationsFolder: '/custom/drizzle' });
  });

  it('falls back to workspace migration folders', async () => {
    const expected = resolve(process.cwd(), 'apps/api/drizzle');
    existsSyncMock.mockImplementation(
      (candidatePath) => String(candidatePath) === resolve(expected, 'meta/_journal.json'),
    );
    const app = { get: jest.fn(() => 'db') };

    await runDatabaseMigrations(app as never);

    expect(migrateMock).toHaveBeenCalledWith('db', { migrationsFolder: expected });
  });

  it('throws a helpful error when no migration journal can be found', async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(runDatabaseMigrations({ get: jest.fn() } as never)).rejects.toThrow(
      'Could not find Drizzle migrations folder.',
    );
  });
});
