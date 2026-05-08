import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { z } from 'zod';

import {
  actionLabel,
  roleLabel,
  summaryFor,
  toneClass,
} from '#/components/activity/activity-formatters';
import { EmptyState } from '#/components/empty-state';
import { QueryState } from '#/components/query-state';
import { Skeleton } from '#/components/skeleton';
import { formatCompactDateTime } from '#/lib/date-format';

import { useAuth } from '../../lib/auth-context';
import { useProject } from '../../lib/project-context';

const searchSchema = z.object({
  projectId: z.string().optional(),
});

type ActivityEntry = {
  id: string;
  projectId: string;
  siteId: string | null;
  userId: string | null;
  role: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
};

export const Route = createFileRoute('/_authenticated/settings/activity')({
  validateSearch: (search) => searchSchema.parse(search),
  component: ActivityPage,
});

function ActivityPage() {
  const auth = useAuth();
  const project = useProject();
  const search = Route.useSearch();
  const projectId = search.projectId ?? project.activeProjectId;

  const activity = useQuery<ActivityEntry[]>({
    queryKey: ['activity', projectId],
    queryFn: () => auth.api.get(`/projects/${projectId}/activity?limit=100`),
    enabled: Boolean(auth.accessToken && projectId),
    staleTime: 5_000,
  });

  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Configuración &gt; Actividad
        </div>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Registro de actividad
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          Todo lo que ocurre en este proyecto: invitaciones, cambios de permisos, sitios creados o
          eliminados, auditorías lanzadas, integraciones modificadas, etc. La auditoría se conserva
          aunque los miembros sean expulsados.
        </p>
      </div>

      {projectId ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-brand-500" />
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Eventos recientes</h2>
          </div>
          <div className="mt-6">
            <QueryState
              status={activity.status}
              data={activity.data}
              error={activity.error}
              onRetry={() => activity.refetch()}
              isEmpty={(list) => list.length === 0}
              loading={
                <ul className="space-y-3">
                  {['s1', 's2', 's3', 's4'].map((slot) => (
                    <li key={slot} className="rounded-xl border border-slate-200 px-4 py-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                    </li>
                  ))}
                </ul>
              }
              empty={
                <EmptyState
                  title="Sin actividad todavía"
                  description="Cuando alguien interactúe con el proyecto verás aquí cada acción."
                />
              }
            >
              {(list) => (
                <ol className="space-y-2.5">
                  {list.map((entry) => {
                    const summary = summaryFor(entry);
                    const actorName =
                      entry.userName?.trim() || entry.userEmail || 'Miembro eliminado';
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                      >
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClass(entry.action)}`}
                        >
                          {actionLabel(entry.action)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold text-slate-900">{actorName}</span>
                            <span className="text-xs font-medium text-slate-500">
                              · {roleLabel(entry.role)}
                            </span>
                          </div>
                          {summary ? (
                            <div className="mt-0.5 truncate text-xs text-slate-600">{summary}</div>
                          ) : null}
                        </div>
                        <time
                          dateTime={entry.createdAt}
                          className="shrink-0 self-center font-mono text-[11px] text-slate-500"
                          title={entry.createdAt}
                        >
                          {formatCompactDateTime(entry.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              )}
            </QueryState>
          </div>
        </article>
      ) : (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No hay un proyecto activo seleccionado.
        </article>
      )}
    </section>
  );
}
