import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@seotracker/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      // v8 is the fastest provider for coverage in vitest >=1; doesn't need
      // instrumentation in the source files at runtime.
      provider: 'v8',
      // Restricted to the files that have tests (auth-store, api-client,
      // cookies). Adding new tests? Add the source file to this list and
      // reuse the same threshold. The point is to ENFORCE that the
      // security-critical auth glue stays well-tested, not to measure overall
      // coverage of every untested route.
      include: [
        'src/lib/api-client.ts',
        'src/lib/auth-store.ts',
        'src/lib/cookies.ts',
        'src/lib/session-server.ts',
      ],
      // Anti-regression thresholds: a hair below current numbers.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
