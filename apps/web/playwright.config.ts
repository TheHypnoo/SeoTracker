import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/authenticated.e2e.ts',
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm build && node .output/server/index.mjs',
    env: {
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      NODE_ENV: 'production',
      PORT: String(port),
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${baseURL}/health`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
