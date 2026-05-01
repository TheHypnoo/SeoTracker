import { Link, createFileRoute } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  FolderKanban,
  Gauge,
  Rocket,
  TrendingDown,
  Workflow,
} from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { EmptyState } from '#/components/empty-state';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { activityDot, statusLabel, statusTone } from '#/components/dashboard/dashboard-helpers';
import { DashboardSkeleton } from '#/components/dashboard/dashboard-skeleton';
import type { DashboardPayload } from '#/components/dashboard/dashboard-types';
import { MetricsPanel } from '#/components/dashboard/metrics-panel';
import {
  EmptyChartState,
  TrendChart,
  TrendDeltaBadge,
  TrendStat,
} from '#/components/dashboard/trend-chart';

import { useAuth } from '../../lib/auth-context';
import { useFormSubmitHandler } from '../../lib/forms';
import { useProject } from '../../lib/project-context';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const auth = useAuth();
  const project = useProject();
  const queryClient = useQueryClient();

  const dashboard = useQuery({
    queryKey: ['project-dashboard', project.activeProjectId],
    queryFn: () => auth.api.get<DashboardPayload>(`/projects/${project.activeProjectId}/dashboard`),
    enabled: Boolean(auth.accessToken && project.activeProjectId),
  });

  const createProject = useMutation({
    mutationFn: (name: string) =>
      auth.api.post<{ id: string; name: string }>('/projects', { name }),
    onSuccess: async (created) => {
      await project.refresh();
      await Promise.all([
        project.setActiveProject(created.id),
        queryClient.invalidateQueries({
          queryKey: ['project-dashboard', created.id],
        }),
      ]);
    },
  });

  const projectForm = useForm({
    defaultValues: { name: '' },
    onSubmit: async ({ value }) => {
      await createProject.mutateAsync(value.name);
    },
  });
  const { error: projectError, onSubmit: onProjectSubmit } = useFormSubmitHandler(projectForm, {
    defaultErrorMessage: 'No se pudo crear el proyecto',
  });

  const quickAudit = useMutation({
    // Sequential to play nice with the API rate-limiter; the ApiClient already
    // retries on 429 honoring Retry-After, so the worst case is a slower run
    // — not a failed batch.
    mutationFn: async (siteIds: string[]) => {
      for (const id of siteIds) {
        await auth.api.post(`/sites/${id}/audits/run`);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['project-dashboard', project.activeProjectId],
      });
    },
  });

  const trendStats = useMemo(() => {
    const trend = dashboard.data?.trend ?? [];
    if (trend.length === 0) return null;
    const scores = trend.map((p) => p.score);
    const last = scores[scores.length - 1];
    const first = scores[0];
    const avg = Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length);
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    return { last, first, avg, highest, lowest, delta: last - first };
  }, [dashboard.data?.trend]);

  // Onboarding: brand new user with no projects yet.
  if (!project.loading && project.projects.length === 0) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Primer paso
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
          Crea tu primer proyecto
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
          El dashboard, los dominios y las automatizaciones se organizan dentro de un proyecto. Crea
          uno para empezar a auditar.
        </p>

        <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={onProjectSubmit}>
          <projectForm.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? 'El nombre del proyecto es obligatorio'
                  : value.trim().length < 3
                    ? 'Debe tener al menos 3 caracteres'
                    : undefined,
            }}
          >
            {(field) => (
              <div className="w-full">
                <TextInput
                  placeholder="Agencia Acme"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  invalid={Boolean(field.state.meta.errors[0])}
                />
                {field.state.meta.errors[0] ? (
                  <p role="alert" className="mt-2 text-xs text-rose-600">
                    {String(field.state.meta.errors[0])}
                  </p>
                ) : null}
              </div>
            )}
          </projectForm.Field>
          <projectForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                size="lg"
                disabled={!canSubmit}
                loading={Boolean(isSubmitting)}
                className="px-6"
              >
                {isSubmitting ? 'Creando...' : 'Crear proyecto'}
              </Button>
            )}
          </projectForm.Subscribe>
        </form>
        {projectError ? (
          <Notice tone="danger" className="mt-4">
            {projectError}
          </Notice>
        ) : null}
      </section>
    );
  }

  const data = dashboard.data;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Proyectos &gt; {project.activeProject?.name ?? 'Proyecto'}
          </div>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
            Panel de Control
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Seguimiento técnico y on-page del proyecto activo.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/projects/new" className="btn-secondary rounded-xl px-5 py-3">
            <FolderKanban size={16} aria-hidden="true" />
            Nuevo proyecto
          </Link>
          {project.activeProjectId ? (
            <Link
              to="/projects/$id/sites"
              params={{ id: project.activeProjectId }}
              className="btn-secondary rounded-xl px-5 py-3"
            >
              <FolderKanban size={16} aria-hidden="true" />
              Nuevo dominio
            </Link>
          ) : null}
          <Button
            type="button"
            size="lg"
            onClick={() => {
              const ids = data?.recentProjects.map((p) => p.id) ?? [];
              if (ids.length > 0) {
                quickAudit.mutate(ids);
              }
            }}
            disabled={!data?.recentProjects.length || quickAudit.isPending}
            loading={quickAudit.isPending}
          >
            <Rocket size={16} aria-hidden="true" />
            {quickAudit.isPending
              ? 'Lanzando...'
              : data?.recentProjects.length && data.recentProjects.length > 1
                ? `Auditar ${data.recentProjects.length} dominios`
                : 'Nueva auditoría'}
          </Button>
        </div>
      </div>

      {dashboard.isLoading ? <DashboardSkeleton /> : null}

      {dashboard.isError ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              No se pudo cargar el dashboard:{' '}
              {dashboard.error instanceof Error ? dashboard.error.message : 'error desconocido'}.
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={() => dashboard.refetch()}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : null}

      {data ? (
        <>
          <MetricsPanel
            items={[
              {
                icon: <FolderKanban size={16} aria-hidden="true" />,
                label: 'Dominios',
                value: String(data.summary.activeProjects),
                tone: 'sky',
              },
              {
                icon: <Workflow size={16} aria-hidden="true" />,
                label: 'Auditorías',
                value: String(data.summary.totalAudits),
                tone: 'indigo',
              },
              {
                icon: <Gauge size={16} aria-hidden="true" />,
                label: 'Score medio',
                value: data.summary.averageScore != null ? `${data.summary.averageScore}` : '--',
                suffix: data.summary.averageScore != null ? '/ 100' : undefined,
                tone: 'emerald',
              },
              {
                icon: <AlertTriangle size={16} aria-hidden="true" />,
                label: 'Críticas',
                value: String(data.summary.criticalIssues),
                tone: 'rose',
              },
              {
                icon: <TrendingDown size={16} aria-hidden="true" />,
                label: 'Regresiones',
                value: String(data.summary.regressions),
                tone: 'amber',
              },
              {
                icon: <Workflow size={16} aria-hidden="true" />,
                label: 'Automatizaciones',
                value: String(data.summary.activeAutomations),
                tone: 'slate',
              },
            ]}
          />

          <div className="grid items-start gap-6 xl:grid-cols-[1.8fr_0.9fr]">
            <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12),transparent_65%)]" />

              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    <Activity size={12} /> Tendencia · 30 días
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                    Score SEO global
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Evolución agregada de todas las auditorías completadas.
                  </p>
                </div>

                {trendStats ? (
                  <div className="flex items-end gap-5">
                    <div className="text-right">
                      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        Último
                      </p>
                      <p className="text-4xl font-black text-slate-950">{trendStats.last}</p>
                    </div>
                    <TrendDeltaBadge delta={trendStats.delta} />
                  </div>
                ) : null}
              </div>

              <div className="relative mt-6">
                {data.trend.length >= 2 ? (
                  <TrendChart points={data.trend} />
                ) : (
                  <EmptyChartState hasSinglePoint={data.trend.length === 1} />
                )}
              </div>

              {trendStats ? (
                <div className="relative mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <TrendStat label="Promedio" value={trendStats.avg} tone="slate" />
                  <TrendStat label="Máximo" value={trendStats.highest} tone="emerald" />
                  <TrendStat label="Mínimo" value={trendStats.lowest} tone="rose" />
                </div>
              ) : null}
            </article>

            <article className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7 xl:max-h-[30rem]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    <Workflow size={12} /> Actividad
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                    Últimos eventos
                  </h2>
                </div>
              </div>

              <div className="relative mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                {data.activity.length === 0 ? (
                  <EmptyState
                    title="Sin actividad reciente"
                    description="Las auditorías, invitaciones y alertas aparecerán aquí."
                  />
                ) : (
                  <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                    {data.activity.map((item) => (
                      <li key={`${item.kind}-${item.createdAt}`} className="relative">
                        <span
                          aria-hidden="true"
                          className={`absolute -left-[27px] top-1 inline-flex h-3 w-3 rounded-full ring-4 ring-white ${activityDot(item.kind)}`}
                        />
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.body}</p>
                        <p className="mt-1.5 text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </article>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Dominios recientes
                </div>
                {project.activeProjectId ? (
                  <Link
                    to="/projects/$id/sites"
                    params={{ id: project.activeProjectId }}
                    className="text-sm font-semibold text-brand-500 no-underline hover:underline"
                  >
                    Ver todos
                  </Link>
                ) : null}
              </div>
              <div className="mt-5 space-y-4">
                {data.recentProjects.length === 0 ? (
                  <EmptyState
                    title="Aún no hay dominios"
                    description="Añade un dominio para empezar a auditarlo."
                    action={
                      project.activeProjectId ? (
                        <Link
                          to="/projects/$id/sites"
                          params={{ id: project.activeProjectId }}
                          className="btn-primary rounded-xl px-4 py-2"
                        >
                          Nuevo dominio
                        </Link>
                      ) : null
                    }
                  />
                ) : (
                  data.recentProjects.map((site) => (
                    <Link
                      key={site.id}
                      to="/sites/$id"
                      params={{ id: site.id }}
                      className="block rounded-xl border border-slate-200 px-5 py-5 no-underline transition hover:border-brand-200 hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-bold text-slate-950">{site.name}</div>
                          <div className="mt-1 font-mono text-sm text-slate-500">{site.domain}</div>
                        </div>
                        <Badge tone="brand">{site.latestScore ?? '--'}/100</Badge>
                      </div>
                      <div className="mt-6 text-sm text-slate-500">
                        {site.latestAuditAt
                          ? `Auditado: ${new Date(site.latestAuditAt).toLocaleDateString()}`
                          : 'Sin auditorías todavía'}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Últimas auditorías
                </div>
                {project.activeProjectId ? (
                  <Link
                    to="/projects/$id/sites"
                    params={{ id: project.activeProjectId }}
                    className="text-sm font-semibold text-brand-500 no-underline hover:underline"
                  >
                    Gestionar dominios
                  </Link>
                ) : null}
              </div>

              {data.recentAudits.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="Aún no hay auditorías"
                    description="Lanza tu primera auditoría desde un dominio."
                  />
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-brand-subtle text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          Auditoría
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Dominio
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Fecha
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Hallazgos
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {data.recentAudits.map((audit) => (
                        <tr key={audit.id}>
                          <td className="px-4 py-4 font-semibold text-brand-500">
                            #{audit.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-4 text-slate-800">{audit.projectName}</td>
                          <td className="px-4 py-4 text-slate-600">
                            {new Date(audit.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-slate-700">{audit.issuesCount}</td>
                          <td className="px-4 py-4">
                            <Badge tone={statusTone(audit.status)}>
                              {statusLabel(audit.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
