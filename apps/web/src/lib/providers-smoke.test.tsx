import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';
import { ProjectProvider, useProject } from './project-context';

vi.mock(import('@tanstack/react-router'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: vi.fn<() => { user: null }>(() => ({
      user: null,
    })) as unknown as typeof actual.useLoaderData,
    useNavigate: vi.fn<() => ReturnType<typeof vi.fn<() => void>>>(() =>
      vi.fn<() => void>(),
    ) as unknown as typeof actual.useNavigate,
  };
});

function Providers({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>{children}</ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ConsumerProbe() {
  const auth = useAuth();
  const project = useProject();

  return (
    <dl>
      <dt>User</dt>
      <dd>{auth.user ? auth.user.email : 'anonymous'}</dd>
      <dt>Project loading</dt>
      <dd>{project.loading ? 'loading' : 'ready'}</dd>
      <dt>Projects</dt>
      <dd>{String(project.projects.length)}</dd>
    </dl>
  );
}

describe('frontend root providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the anonymous provider stack without fetching project data', async () => {
    render(
      <Providers>
        <ConsumerProbe />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('anonymous')).toBeTruthy();
    });
    expect(screen.getByText('loading')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});
