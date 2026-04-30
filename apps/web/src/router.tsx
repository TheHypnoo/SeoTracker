import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    // Initial context placeholder. The real `session` is provided by the
    // root route's `beforeLoad` on every request.
    context: {
      session: { user: null },
    },

    scrollRestoration: true,
    defaultPreload: 'intent',
    // Preloads / re-renders within this window reuse cached `beforeLoad` and
    // `loader` results. With 0 (the previous default) every Link hover in the
    // header re-ran the root `beforeLoad` → `getServerSession()` → an extra
    // `/auth/session` call to the API. 30 s gives navigation freshness without
    // hammering the backend on routine UI interactions.
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 30_000,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
