import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
  extends: [ultracite],
  singleQuote: true,
  ignorePatterns: [
    'apps/api/drizzle/**',
    'apps/api/drizzle.config.d.ts',
    'apps/api/drizzle.config.js',
    'apps/api/drizzle.config.js.map',
    'apps/web/src/routeTree.gen.ts',
    '**/coverage/**',
    '**/dist/**',
    '**/.output/**',
    '**/.tanstack/**',
    '**/.turbo/**',
  ],
});
