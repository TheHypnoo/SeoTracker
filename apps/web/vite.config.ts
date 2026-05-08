import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

const config = defineConfig({
  plugins: [
    devtools(),
    // Same-origin proxy at the Nitro layer: requests to /api/** from the
    // browser hit the dev server (localhost:3000) and are forwarded to the
    // backend. This keeps frontend, server functions and API on the same
    // origin so the cookies the API sets are visible to TanStack Start
    // server fns (no cross-origin / cross-port cookie shenanigans).
    nitro({
      handlers: [
        { route: '/health', handler: './src/server/health.ts' },
        { route: '/api/**', handler: './src/server/api-proxy.ts' },
      ],
      rollupConfig: { external: [/^@sentry\//] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});

export default config;
