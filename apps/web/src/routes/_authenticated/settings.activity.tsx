import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@seotracker/shared-types';
import { Check, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { z } from 'zod';

import {
  actionLabel,
  actionTone,
  roleLabel,
  summaryFor,
} from '#/components/activity/activity-formatters';
import { Card } from '#/components/card';
import { EmptyState } from '#/components/empty-state';
import { PageHeader } from '#/components/page-header';
import { QueryState } from '#/components/query-state';
import { Skeleton } from '#/components/skeleton';
import { formatCompactDateTime } from '#/lib/date-format';

import { useAuth } from '../../lib/auth-context';
import { useProject } from '../../lib/project-context';
import { usePermissions } from '../../lib/use-permissions';

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

type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-500',
  positive: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
};

const TONE_ICON: Record<Tone, ComponentType<{ size?: number; className?: string }>> = {
  neutral: Pencil,
  positive: Plus,
  warning: Pencil,
  danger: Trash2,
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
  const permissions = usePermissions(projectId);
  const canView = permissions.can(Permission.ACTIVITY_READ);

  const activity = useQuery<ActivityEntry[]>({
    queryKey: ['activity', projectId],
    queryFn: () => auth.api.get(`/projects/${projectId}/activity?limit=100`),
    enabled: Boolean(auth.accessToken && projectId && canView),
    staleTime: 5_000,
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Configuración · Actividad"
        title="Registro de actividad"
        description="Pista de auditoría del proyecto: invitaciones, cambios de permisos, dominios creados o eliminados, auditorías lanzadas e integraciones modificadas. El registro se conserva aunque los miembros sean expulsados."
      />

      {!projectId ? (
        <Card className="p-6">
          <EmptyState
            title="Sin proyecto activo"
            description="Selecciona un proyecto para ver su registro de actividad."
          />
        </Card>
      ) : permissions.isLoading ? (
        <Card className="p-6">
          <ul className="space-y-5">
            {['s1', 's2', 's3', 's4'].map((slot) => (
              <li key={slot} className="flex gap-4">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : !canView ? (
        <Card className="p-6">
          <EmptyState
            icon={<Lock size={22} aria-hidden="true" />}
            title="No tienes acceso al registro de actividad"
            description="El registro de actividad es una pista de auditoría sensible. Pide al propietario del proyecto que te conceda el permiso «Ver registro de actividad»."
          />
        </Card>
      ) : (
        <Card className="p-6">
          <QueryState
            status={activity.status}
            data={activity.data}
            error={activity.error}
            onRetry={() => activity.refetch()}
            isEmpty={(list) => list.length === 0}
            loading={
              <ul className="space-y-5">
                {['s1', 's2', 's3', 's4', 's5'].map((slot) => (
                  <li key={slot} className="flex gap-4">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </div>
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
            {(list) => <ActivityTimeline entries={list} />}
          </QueryState>
        </Card>
      )}
    </section>
  );
}

function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ol className="relative">
      {entries.map((entry, index) => {
        const tone = actionTone(entry.action);
        const Icon = TONE_ICON[tone];
        const actorName = entry.userName?.trim() || entry.userEmail || 'Miembro eliminado';
        const summary = summaryFor(entry);
        const isLast = index === entries.length - 1;
        return (
          <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute left-[15px] top-9 bottom-0 w-px bg-slate-200"
              />
            ) : null}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${TONE_DOT[tone]}`}
            >
              {tone === 'positive' && entry.action.endsWith('completed') ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Icon size={14} aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm text-slate-900">
                  <span className="font-semibold">{actorName}</span>
                  <span className="text-slate-400"> · {roleLabel(entry.role)}</span>
                </p>
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 font-mono text-[11px] text-slate-400"
                  title={entry.createdAt}
                >
                  {formatCompactDateTime(entry.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-700">
                {actionLabel(entry.action)}
              </p>
              {summary ? (
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{summary}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
