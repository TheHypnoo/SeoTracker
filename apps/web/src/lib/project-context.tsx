import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useMemo } from 'react';
import type { PropsWithChildren } from 'react';

import { useAuth } from './auth-context';

interface Project {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

interface Preferences {
  userId: string;
  activeProjectId: string | null;
}

interface ProjectContextValue {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  loading: boolean;
  setActiveProject: (projectId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  // Gate on `auth.user`, not `auth.accessToken`. After a hard reload the SSR
  // loader resolves the user but does NOT populate the access token (it lives
  // in client memory and is renewed lazily). With the old gate the queries
  // never fired post-reload and the UI claimed the user had no projects. The
  // ApiClient handles missing-token requests transparently: the first 401
  // triggers a single-flight `/auth/refresh` and the original request is
  // replayed with the fresh token.
  const projectsQuery = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () => auth.api.get<Project[]>('/projects'),
    queryKey: ['projects'],
  });

  const preferencesQuery = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () => auth.api.get<Preferences>('/users/preferences'),
    queryKey: ['user-preferences', auth.user?.id],
  });

  const updatePreferences = useMutation({
    mutationFn: (projectId: string) =>
      auth.api.patch<Preferences>('/users/preferences', {
        activeProjectId: projectId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['user-preferences', auth.user?.id],
      });
    },
    // Local handling lets us refresh the cached value back to the server's
    // truth so the UI doesn't get stuck on an optimistic state. The global
    // MutationCache.onError still surfaces the toast.
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['user-preferences', auth.user?.id],
      });
    },
  });

  const value = useMemo<ProjectContextValue>(() => {
    const authReady = Boolean(auth.user);
    const projects = projectsQuery.data ?? [];
    const activeProjectId =
      preferencesQuery.data?.activeProjectId ?? (projects.length > 0 ? projects[0].id : null);
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

    return {
      activeProject,
      activeProjectId,
      loading:
        !authReady ||
        projectsQuery.isPending ||
        preferencesQuery.isPending ||
        updatePreferences.isPending,
      projects,
      refresh: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
          queryClient.invalidateQueries({
            queryKey: ['user-preferences', auth.user?.id],
          }),
        ]);
      },
      setActiveProject: async (projectId: string) => {
        await updatePreferences.mutateAsync(projectId);
      },
    };
  }, [
    auth.user,
    preferencesQuery.data?.activeProjectId,
    preferencesQuery.isPending,
    queryClient,
    updatePreferences,
    projectsQuery.data,
    projectsQuery.isPending,
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const value = use(ProjectContext);
  if (!value) {
    throw new Error('useProject must be used inside ProjectProvider');
  }

  return value;
}
