import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

if (!existsSync('.git')) {
  console.log('[INFO] No .git metadata found, skipping git hook install');
  process.exit(0);
}

if (!statSync('.git').isDirectory()) {
  console.log('[INFO] Git metadata is a worktree file, skipping git hook install');
  process.exit(0);
}

execSync('pnpm exec simple-git-hooks', { stdio: 'inherit' });
