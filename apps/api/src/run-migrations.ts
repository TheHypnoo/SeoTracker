import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { DRIZZLE } from '@seotracker/server';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const logger = new Logger('DatabaseMigrations');

function migrationsFolder(): string {
  const configured = process.env.DATABASE_MIGRATIONS_DIR?.trim();
  const candidates = [
    configured,
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/api/drizzle'),
  ].filter((candidate): candidate is string => !!candidate);

  const folder = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'meta/_journal.json')),
  );
  if (!folder) {
    throw new Error(`Could not find Drizzle migrations folder. Tried: ${candidates.join(', ')}`);
  }

  return folder;
}

export async function runDatabaseMigrations(app: INestApplicationContext) {
  const folder = migrationsFolder();
  logger.log(`Applying database migrations from ${folder}`);
  await migrate(app.get(DRIZZLE), { migrationsFolder: folder });
  logger.log('Database migrations are up to date');
}
