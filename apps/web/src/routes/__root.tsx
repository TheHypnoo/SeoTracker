import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '#/components/error-boundary';
import { HeadContent, Link, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { AppLayout } from '../components/layout';
import { ToastProvider } from '../components/toast';
import { ApiClientError } from '../lib/api-client';
import { AuthProvider } from '../lib/auth-context';
import { ProjectProvider } from '../lib/project-context';
import { getServerSession } from '../lib/session-server';
import type { ServerSession } from '../lib/session-server';
import { toastBridge } from '../lib/toast-bridge';
import appCss from '../styles.css?url';

export interface RouterContext {
  session: ServerSession;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Resolve the visitor's session ONCE per request. Each /auth/refresh call
  // rotates the refresh token, so calling it from multiple places in the
  // same navigation (root loader + protected layout beforeLoad + ...) would
  // race each other and revoke the session. Putting it in the root
  // beforeLoad and exposing it through the router context lets every child
  // beforeLoad / loader read the same value with zero extra network calls.
  beforeLoad: async () => {
    const session = await getServerSession();
    return { session };
  },
  // Re-export the session as loader data so consumers using
  // `useLoaderData({ from: '__root__' })` keep working.
  loader: ({ context }) => context.session,
  head: () => ({
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'alternate icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'SEOTracker' },
      {
        name: 'description',
        content: 'Auditorías SEO con histórico, automatización y colaboración en equipo.',
      },
      { name: 'robots', content: 'index, follow, max-image-preview:large' },
      { name: 'theme-color', content: '#0f172a' },
      { name: 'color-scheme', content: 'light' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">404</p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">Página no encontrada</h1>
      <p className="max-w-md text-sm text-slate-500">
        La ruta a la que intentas acceder no existe o se ha movido.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-brand-700"
      >
        Volver al panel
      </Link>
    </div>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    let lastRateLimitToastAt = 0;

    const showRateLimitToast = (error: unknown) => {
      if (!(error instanceof ApiClientError) || !error.isRateLimited) {
        return false;
      }

      const now = Date.now();
      if (now - lastRateLimitToastAt < 10_000) {
        return true;
      }
      lastRateLimitToastAt = now;

      const seconds =
        error.retryAfterMs !== undefined ? Math.max(1, Math.ceil(error.retryAfterMs / 1000)) : 5;
      toastBridge.warning(
        'Demasiadas solicitudes',
        `Has hecho muchas peticiones seguidas. Espera ${seconds} ${
          seconds === 1 ? 'segundo' : 'segundos'
        } y vuelve a intentarlo.`,
      );
      return true;
    };

    const shouldRetryQuery = (failureCount: number, error: unknown) => {
      if (error instanceof ApiClientError && error.isRateLimited) {
        return false;
      }

      return failureCount < 1;
    };

    return new QueryClient({
      defaultOptions: {
        mutations: {
          retry: 0,
        },
        queries: {
          gcTime: 5 * 60_000,
          refetchOnWindowFocus: false,
          retry: shouldRetryQuery,
          staleTime: 30_000,
        },
      },
      queryCache: new QueryCache({
        onError: (error) => {
          if (showRateLimitToast(error)) {
            return;
          }
        },
      }),
      // Surface every mutation error as a toast so the user always gets
      // feedback. Mutations that want to fully handle the UX themselves
      // can opt out with `meta: { skipGlobalErrorToast: true }`.
      mutationCache: new MutationCache({
        onError: (error, _variables, _context, mutation) => {
          if (mutation.meta?.skipGlobalErrorToast) {
            return;
          }

          if (showRateLimitToast(error)) {
            return;
          }

          toastBridge.error(
            'No se pudo completar la acción',
            error instanceof Error ? error.message : 'Error desconocido',
          );
        },
      }),
    });
  });

  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ProjectProvider>
              <ToastProvider>
                <AppLayout>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </AppLayout>
              </ToastProvider>
            </ProjectProvider>
          </AuthProvider>
        </QueryClientProvider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
