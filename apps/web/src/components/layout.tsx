import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';
import { CommandPalette } from './command-palette';
import { PublicHeader } from './layout/public-header';
import { Sidebar } from './layout/sidebar';
import { Topbar } from './layout/topbar';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

/**
 * Top-level layout decision tree:
 *  - authed user → app shell (Sidebar + Topbar + main)
 *  - unauthed user on /login, /register, /forgot-password,
 *    /reset-password/* or /legal/* → bare layout (no chrome at all)
 *  - everything else (landing, public pages) → top header with public nav
 *
 * The session is resolved server-side in the root loader (getServerSession)
 * and copied into the auth store on hydration, so `auth.user` is already
 * populated on the very first paint of the SSR HTML — no flash, no client-
 * side check, no auth.loading flag.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });

  // Close mobile nav on every navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Persist sidebar collapse preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Global Cmd/Ctrl+K → toggle the command palette. Listener only attaches
  // for authed users (the only branch that mounts <CommandPalette>).
  const togglePalette = useCallback(() => setPaletteOpen((value) => !value), []);
  useEffect(() => {
    if (!auth.user) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [auth.user, togglePalette]);

  if (auth.user) {
    return (
      <div className="min-h-screen bg-surface-app text-slate-900">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>

        <div className="flex min-h-screen">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
          />

          {mobileNavOpen ? (
            <button
              type="button"
              aria-label="Cerrar navegación"
              className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              onOpenMobileNav={() => setMobileNavOpen(true)}
              mobileNavOpen={mobileNavOpen}
              onOpenPalette={togglePalette}
            />
            <main id="main-content" className="flex-1 px-4 py-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    );
  }

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/legal/');

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--color-brand-50),transparent_48%),var(--color-surface-app)] text-slate-900">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--color-brand-50),transparent_48%),var(--color-surface-app)] text-slate-900">
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
