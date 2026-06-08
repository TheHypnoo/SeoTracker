import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const webPort = Number(process.env.PLAYWRIGHT_AUTH_WEB_PORT ?? 3101);
const apiPort = Number(process.env.PLAYWRIGHT_AUTH_API_PORT ?? 4100);
const baseURL = `http://localhost:${webPort}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const webDir = import.meta.dirname;

function localJwtSigningValue(kind: 'access' | 'refresh'): string {
  return ['public', 'playwright', kind, 'signing', 'value', 'for', 'local', 'e2e'].join('-');
}

const apiEnv = {
  APP_URL: baseURL,
  COOKIE_DOMAIN: 'localhost',
  COOKIE_SECURE: 'false',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/seotracker_test',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? localJwtSigningValue('access'),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? localJwtSigningValue('refresh'),
  NODE_ENV: 'test',
  PORT: String(apiPort),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  SMTP_HOST: process.env.SMTP_HOST ?? 'localhost',
  SMTP_PORT: process.env.SMTP_PORT ?? '1025',
  SMTP_SECURE: process.env.SMTP_SECURE ?? 'false',
  TRUST_PROXY: process.env.TRUST_PROXY ?? '0',
};

const webEnv = {
  API_PROXY_TARGET: apiURL,
  HOST: 'localhost',
  NITRO_HOST: 'localhost',
  NITRO_PORT: String(webPort),
  NODE_ENV: 'production',
  PORT: String(webPort),
  SERVER_API_URL: `${apiURL}/api/v1`,
  VITE_API_URL: '/api/v1',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/authenticated.e2e.ts',
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'pnpm --filter @seotracker/shared-types build && pnpm --filter @seotracker/server build && pnpm --filter api build && pnpm --filter api start',
      cwd: rootDir,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      url: `${apiURL}/api/v1/health/readiness`,
    },
    {
      command: 'pnpm build && node .output/server/index.mjs',
      cwd: webDir,
      env: webEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      url: `${baseURL}/health`,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
