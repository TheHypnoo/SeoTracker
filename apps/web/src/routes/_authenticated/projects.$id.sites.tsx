import { useForm } from '@tanstack/react-form';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, Globe, Play, Plus, Search, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '#/components/button';
import { Modal } from '#/components/modal';
import { Notice } from '#/components/notice';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { TextInput } from '#/components/text-input';
import type { PaginatedResponse } from '@seotracker/shared-types';

import { useAuth } from '../../lib/auth-context';
import { formatDisplayDateTime } from '../../lib/date-format';
import { createSubmitHandler, firstFormError } from '../../lib/forms';
import { useProject } from '../../lib/project-context';
import { pollWhileAnyLatestAuditActive } from '../../lib/refetch-intervals';
import { getTimezoneOptions } from '../../lib/timezones';

type Project = {
  id: string;
  name: string;
};

type ProjectRow = {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  active: boolean;
  latestAuditStatus: string | null;
  latestAuditAt: string | null;
  latestScore: number | null;
  latestAuditId: string | null;
  automationEnabled: boolean;
  criticalIssuesCount: number;
};

export const Route = createFileRoute('/_authenticated/projects/$id/sites')({
  component: ProjectProjectsPage,
});

function ProjectProjectsPage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const project = useProject();
  const queryClient = useQueryClient();
  const {
    searchState,
    statusState,
    automationState,
    showCreateFormState,
    showAdvancedState,
    createErrorState,
    pageState,
  } = useProjectSitesUiState();
  const [search, setSearch] = searchState;
  const [status, setStatus] = statusState;
  const [automation, setAutomation] = automationState;
  const [showCreateForm, setShowCreateForm] = showCreateFormState;
  const [showAdvanced, setShowAdvanced] = showAdvancedState;
  const [createError, setCreateError] = createErrorState;
  const [page, setPage] = pageState;
  const pageSize = 25;
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const projectDetail = useQuery({
    queryKey: ['project', id],
    queryFn: () => auth.api.get<Project>(`/projects/${id}`),
    enabled: Boolean(auth.accessToken),
  });

  const sites = useQuery({
    queryKey: ['sites', id, search, status, automation, page, pageSize],
    queryFn: () => {
      const query = new URLSearchParams({ projectId: id });
      if (search.trim()) {
        query.set('search', search.trim());
      }
      if (status) {
        query.set('status', status);
      }
      if (automation !== 'all') {
        query.set('automation', automation);
      }
      query.set('limit', String(pageSize));
      query.set('offset', String(page * pageSize));
      return auth.api.get<PaginatedResponse<ProjectRow>>(`/sites?${query.toString()}`);
    },
    enabled: Boolean(auth.accessToken),
    refetchInterval: pollWhileAnyLatestAuditActive,
  });

  const projectItems = sites.data?.items ?? [];
  const totalProjects = sites.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));
  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;

  const createProject = useMutation({
    mutationFn: (payload: { name: string; domain: string; timezone: string }) =>
      auth.api.post<ProjectRow>('/sites', {
        projectId: id,
        ...payload,
      }),
    onSuccess: async () => {
      setCreateError(null);
      setShowCreateForm(false);
      await queryClient.invalidateQueries({ queryKey: ['sites', id] });
      await queryClient.invalidateQueries({
        queryKey: ['project-dashboard', id],
      });
    },
  });

  const projectForm = useForm({
    defaultValues: {
      name: '',
      domain: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    onSubmit: async ({ value, formApi }) => {
      setCreateError(null);
      await createProject.mutateAsync({
        name: value.name.trim(),
        domain: value.domain.trim(),
        timezone: value.timezone.trim(),
      });
      formApi.reset();
      setShowAdvanced(false);
    },
  });

  const runAudit = useMutation({
    mutationFn: (siteId: string) => auth.api.post(`/sites/${siteId}/audits/run`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sites', id] });
      await queryClient.invalidateQueries({
        queryKey: ['project-dashboard', id],
      });
    },
  });

  const criticalProjects = projectItems.filter((site) => site.criticalIssuesCount > 0).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {projectDetail.isLoading && !projectDetail.data && !project.activeProject ? (
              <Skeleton className="inline-block h-3 w-32 align-middle" />
            ) : (
              (projectDetail.data?.name ?? project.activeProject?.name ?? 'Proyecto')
            )}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Dominios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona los dominios que quieres monitorizar y lanza auditorías bajo demanda.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <Globe size={12} aria-hidden="true" />
              {totalProjects} {totalProjects === 1 ? 'dominio' : 'dominios'}
            </span>
            {criticalProjects > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
                {criticalProjects} con problemas críticos
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            variant="secondary"
            size="sm"
          >
            <Plus size={14} />
            Nuevo dominio
          </Button>
          <Button
            type="button"
            onClick={() => {
              const firstProject = projectItems[0];
              if (firstProject) {
                runAudit.mutate(firstProject.id);
              }
            }}
            disabled={!projectItems.length || runAudit.isPending}
            size="sm"
          >
            <Play size={14} />
            {runAudit.isPending ? 'Lanzando...' : 'Nueva auditoría'}
          </Button>
        </div>
      </div>

      <Modal
        open={showCreateForm}
        onOpenChange={(next) => {
          setShowCreateForm(next);
          if (!next) {
            projectForm.reset();
            setCreateError(null);
            setShowAdvanced(false);
          }
        }}
        title="Añadir dominio"
        description="Asocia un dominio al proyecto activo y deja preparada su primera auditoría."
      >
        <form
          className="space-y-4"
          onSubmit={createSubmitHandler(async () => {
            try {
              await projectForm.handleSubmit();
            } catch (error) {
              setCreateError(
                error instanceof Error ? error.message : 'No se pudo crear el dominio',
              );
            }
          })}
        >
          <projectForm.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? 'El nombre del dominio es obligatorio'
                  : value.trim().length < 2
                    ? 'Debe tener al menos 2 caracteres'
                    : undefined,
            }}
          >
            {(field) => (
              <div>
                <label htmlFor="new-site-name" className="text-sm font-medium text-slate-700">
                  Nombre del dominio
                </label>
                <TextInput
                  id="new-site-name"
                  name="name"
                  className="mt-1.5"
                  placeholder="Nombre del dominio"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {firstFormError(field.state.meta.errors) ? (
                  <p className="mt-2 text-xs text-rose-600">
                    {firstFormError(field.state.meta.errors)}
                  </p>
                ) : null}
              </div>
            )}
          </projectForm.Field>

          <projectForm.Field
            name="domain"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? 'El dominio es obligatorio'
                  : !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())
                    ? 'Introduce un dominio válido'
                    : undefined,
            }}
          >
            {(field) => (
              <div>
                <label htmlFor="new-site-domain" className="text-sm font-medium text-slate-700">
                  Dominio
                </label>
                <TextInput
                  id="new-site-domain"
                  name="domain"
                  className="mt-1.5"
                  placeholder="example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {firstFormError(field.state.meta.errors) ? (
                  <p className="mt-2 text-xs text-rose-600">
                    {firstFormError(field.state.meta.errors)}
                  </p>
                ) : null}
              </div>
            )}
          </projectForm.Field>

          <div className="border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded"
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? '▾' : '▸'} Opciones avanzadas
            </button>
            {showAdvanced ? (
              <projectForm.Field
                name="timezone"
                validators={{
                  onChange: ({ value }) =>
                    !value.trim() ? 'La zona horaria es obligatoria' : undefined,
                }}
              >
                {(field) => (
                  <div className="mt-3">
                    <label
                      htmlFor="site-timezone"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Zona horaria (programación de auditorías)
                    </label>
                    <div className="mt-1">
                      <SelectInput
                        id="site-timezone"
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                        options={timezoneOptions}
                        placeholder="Selecciona zona horaria"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Por defecto se detecta desde el navegador. Solo afecta al cron de auditorías
                      programadas.
                    </p>
                    {firstFormError(field.state.meta.errors) ? (
                      <p className="mt-2 text-xs text-rose-600">
                        {firstFormError(field.state.meta.errors)}
                      </p>
                    ) : null}
                  </div>
                )}
              </projectForm.Field>
            ) : null}
          </div>

          {createError ? <Notice tone="danger">{createError}</Notice> : null}

          <projectForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Guardando...' : 'Guardar dominio'}
                </Button>
              </div>
            )}
          </projectForm.Subscribe>
        </form>
      </Modal>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm transition focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-200 sm:max-w-md">
          <Search size={14} className="text-slate-400" aria-hidden="true" />
          <input
            className="w-full bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="Buscar dominios..."
            aria-label="Buscar dominios"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>

        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <SelectInput
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(0);
            }}
            placeholder="Estado"
            triggerClassName="min-w-44"
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'COMPLETED', label: 'Completado' },
              { value: 'RUNNING', label: 'Ejecutando' },
              { value: 'FAILED', label: 'Error' },
              { value: 'QUEUED', label: 'En cola' },
            ]}
          />

          <SelectInput
            value={automation}
            onValueChange={(value) => {
              setAutomation(value as 'all' | 'active' | 'inactive');
              setPage(0);
            }}
            placeholder="Automatización"
            triggerClassName="min-w-44"
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'active', label: 'Automatizadas' },
              { value: 'inactive', label: 'Manuales' },
            ]}
          />
        </div>
      </div>

      {sites.isLoading ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((slot) => (
            <li key={slot} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
              <Skeleton className="mt-5 h-10 w-24" />
              <Skeleton className="mt-3 h-3 w-full" />
            </li>
          ))}
        </ul>
      ) : projectItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No hay dominios que coincidan con los filtros.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Crea un dominio nuevo o limpia los filtros para verlos todos.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projectItems.map((site) => (
            <li key={site.id}>
              <ProjectCard
                site={site}
                onRun={() => runAudit.mutate(site.id)}
                running={runAudit.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {totalProjects > pageSize ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {page + 1} de {totalPages} · {totalProjects} dominios
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={!hasPrev}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPage((value) => value + 1)}
              disabled={!hasNext}
            >
              Siguiente
              <ChevronRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProjectCard({
  site,
  onRun,
  running,
}: {
  site: ProjectRow;
  onRun: () => void;
  running: boolean;
}) {
  const score = site.latestScore;
  const scoreColor = scoreTone(score);
  const hasCritical = site.criticalIssuesCount > 0;

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to="/sites/$id"
            params={{ id: site.id }}
            className="block truncate text-base font-semibold text-slate-900 no-underline hover:text-brand-700"
          >
            {site.name}
          </Link>
          <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{site.domain}</div>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone(site.latestAuditStatus)}`}
        >
          {statusLabel(site.latestAuditStatus)}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Puntuación
          </div>
          <div className={`mt-0.5 text-3xl font-bold tabular-nums ${scoreColor}`}>
            {score ?? '--'}
            {score !== null ? <span className="ml-0.5 text-sm text-slate-400">/100</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-[11px] text-slate-500">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              site.automationEnabled
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Zap size={10} aria-hidden="true" />
            {site.automationEnabled ? 'Automática' : 'Manual'}
          </span>
          {hasCritical ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
              {site.criticalIssuesCount} críticos
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        {site.latestAuditAt ? (
          <>Última auditoría · {formatDisplayDateTime(site.latestAuditAt)}</>
        ) : (
          <>Sin auditorías todavía</>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-4">
        <Link
          to="/sites/$id"
          params={{ id: site.id }}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 no-underline transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Eye size={14} aria-hidden="true" />
          Abrir dominio
        </Link>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-500 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          title="Ejecutar auditoría"
        >
          <Play size={14} aria-hidden="true" />
          {running ? 'Lanzando...' : 'Auditar'}
        </button>
      </div>
    </article>
  );
}

function useProjectSitesUiState() {
  return {
    searchState: useState(''),
    statusState: useState(''),
    automationState: useState<'all' | 'active' | 'inactive'>('all'),
    showCreateFormState: useState(false),
    showAdvancedState: useState(false),
    createErrorState: useState<string | null>(null),
    pageState: useState(0),
  };
}

function statusLabel(status: string | null) {
  if (status === 'COMPLETED') return 'Completado';
  if (status === 'RUNNING') return 'Ejecutando';
  if (status === 'FAILED') return 'Error';
  if (status === 'QUEUED') return 'En cola';
  return 'Sin datos';
}

function statusTone(status: string | null) {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'RUNNING') return 'bg-sky-100 text-sky-700';
  if (status === 'FAILED') return 'bg-rose-100 text-rose-700';
  if (status === 'QUEUED') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

function scoreTone(score: number | null) {
  if (score === null) return 'text-slate-400';
  if (score >= 85) return 'text-emerald-600';
  if (score >= 65) return 'text-amber-600';
  return 'text-rose-600';
}
