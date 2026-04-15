import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const hasGitMetadata = existsSync('.git');

if (!hasGitMetadata) {
  console.log('[INFO] No .git directory found, skipping git hook install');
  process.exit(0);
}

execSync('pnpm exec simple-git-hooks', { stdio: 'inherit' });
