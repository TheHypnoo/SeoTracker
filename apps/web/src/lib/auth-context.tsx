import { useQueryClient } from '@tanstack/react-query';
import { useLoaderData, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import type { PropsWithChildren } from 'react';

import { api, useAuthStore } from './auth-store';
import type { ServerSession } from './session-server';

// AuthProvider keeps its name for consumer compatibility but is now a thin
// adapter: it copies the SSR-resolved session from the root route's loader
// into the Zustand store. There is no client-side bootstrap (no useEffect
// refresh, no loading flag) — the server already did the work and the HTML
// arrives with `accessToken` and `user` already known.
export function AuthProvider({ children }: PropsWithChildren) {
  const session = useLoaderData({ from: '__root__' }) as ServerSession | undefined;
  const setSession = useAuthStore((s) => s.setSession);

  // Sync the store with whatever the server resolved. The access token is
  // NOT included in the server payload (we don't rotate tokens on every
  // navigation); it lives in client memory after login and is renewed
  // transparently by the ApiClient on 401.
  //
  // CRITICAL: depend on a primitive (the user id) — NOT on the user object
  // reference. The loader returns a fresh object every time the root
  // revalidates and that would re-fire setSession on every render, which
  // in turn invalidates the router and triggers another beforeLoad RPC
  // → /auth/session loop hammering the backend.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (session?.user) {
      setSession({ user: session.user });
    } else {
      setSession({ accessToken: null, user: null });
    }
    // session.user is read inside; its identity is irrelevant — only the id matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, setSession]);

  return <>{children}</>;
}

// Façade hook that mirrors the previous AuthContextValue shape so consumers
// (20+ files using useAuth()) keep working unchanged. There is no `loading`
// field because the auth state arrives already resolved from the server.
export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const refresh = useAuthStore((s) => s.refresh);
  const logoutAction = useAuthStore((s) => s.logout);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = useMemo(
    () => async () => {
      await logoutAction({
        afterClear: async () => {
          queryClient.clear();
          await navigate({ to: '/' });
        },
      });
    },
    [logoutAction, navigate, queryClient],
  );

  return {
    accessToken,
    api,
    forgotPassword,
    login,
    logout,
    refresh,
    register,
    resetPassword,
    user,
  };
}
