import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PaginatedResponse } from '@seotracker/shared-types';
import { EmptyState } from '#/components/empty-state';
import { Pagination } from '#/components/pagination';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import {
  scoreBg,
  scoreTone,
  statusLabel,
  statusTone,
  triggerLabel,
} from '#/components/site-detail/helpers';
import { useAuth } from '../../lib/auth-context';
import { formatDisplayDateTime } from '../../lib/date-format';
import { pollWhileAnyAuditActive } from '../../lib/refetch-intervals';

interface ProjectAuditRow {
  id: string;
  trigger: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK';
  status: string;
  score: number | null;
  createdAt: string;
  finishedAt: string | null;
  issuesCount: number;
  criticalIssuesCount: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
}

interface SiteOption {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

export const Route = createFileRoute('/_authenticated/projects/$id/audits')({
  component: ProjectAuditsPage,
});

function ProjectAuditsPage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const sites = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () =>
      auth.api.get<PaginatedResponse<SiteOption>>(`/sites?projectId=${id}&limit=200&offset=0`),
    queryKey: ['sites-list', id],
  });

  const audits = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (statusFilter) params.set('status', statusFilter);
      if (triggerFilter) params.set('trigger', triggerFilter);
      if (siteFilter) params.set('siteId', siteFilter);
      return auth.api.get<PaginatedResponse<ProjectAuditRow>>(
        `/projects/${id}/audits?${params.toString()}`,
      );
    },
    queryKey: ['project-audits', id, statusFilter, triggerFilter, siteFilter, offset],
    refetchInterval: pollWhileAnyAuditActive,
  });

  const items = audits.data?.items ?? [];
  const total = audits.data?.total ?? 0;

  const siteOptions = useMemo(
    () => [
      { label: 'Todos los dominios', value: '' },
      ...(sites.data?.items ?? []).map((s) => ({ label: s.name, value: s.id })),
    ],
    [sites.data],
  );

  const resetOffset = () => setOffset(0);

  return (
    <section className="space-y-5">
      <header>
        <p className="text-sm font-medium text-slate-500">Proyecto</p>
        <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Auditorías
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Histórico cross-site de todas las auditorías del proyecto. Filtra por dominio, estado o
          disparador.
        </p>
      </header>

      <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap gap-2">
            <SelectInput
              value={siteFilter}
              onValueChange={(value) => {
                setSiteFilter(value);
                resetOffset();
              }}
              placeholder="Dominio"
              triggerClassName="min-w-44 py-1.5 text-xs"
              options={siteOptions}
            />
            <SelectInput
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                resetOffset();
              }}
              placeholder="Estado"
              triggerClassName="min-w-36 py-1.5 text-xs"
              options={[
                { label: 'Todos', value: '' },
                { label: 'Completado', value: 'COMPLETED' },
                { label: 'Ejecutando', value: 'RUNNING' },
                { label: 'Error', value: 'FAILED' },
                { label: 'En cola', value: 'QUEUED' },
              ]}
            />
            <SelectInput
              value={triggerFilter}
              onValueChange={(value) => {
                setTriggerFilter(value);
                resetOffset();
              }}
              placeholder="Disparador"
              triggerClassName="min-w-36 py-1.5 text-xs"
              options={[
                { label: 'Todos', value: '' },
                { label: 'Manual', value: 'MANUAL' },
                { label: 'Programada', value: 'SCHEDULED' },
                { label: 'Webhook', value: 'WEBHOOK' },
              ]}
            />
          </div>
          <Pagination
            total={total}
            offset={offset}
            pageSize={PAGE_SIZE}
            onChange={setOffset}
            itemLabel="auditorías"
          />
        </div>

        {audits.isLoading ? (
          <ul className="mt-4 space-y-3">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </ul>
        ) : items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Sin auditorías"
              description="No hay auditorías que cumplan los filtros aplicados."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((audit) => (
              <li key={audit.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ${scoreBg(audit.score)}`}
                  >
                    <span className={`text-sm font-bold ${scoreTone(audit.score)}`}>
                      {audit.score ?? '--'}
                    </span>
                    <span className="text-[9px] font-medium text-slate-400">score</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/sites/$id"
                        params={{ id: audit.siteId }}
                        className="truncate text-sm font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {audit.siteName}
                      </Link>
                      <span className="font-mono text-xs text-slate-500">{audit.siteDomain}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone(audit.status)}`}
                      >
                        {statusLabel(audit.status)}
                      </span>
                      <span className="text-xs text-slate-500">{triggerLabel(audit.trigger)}</span>
                      {audit.criticalIssuesCount > 0 ? (
                        <span className="text-xs font-medium text-rose-600">
                          {audit.criticalIssuesCount} críticas
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-500">
                        · {audit.issuesCount} hallazgos
                      </span>
                      <span className="text-xs text-slate-400">
                        · {formatDisplayDateTime(audit.createdAt)}
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/sites/$id/audits/$auditId"
                    params={{ auditId: audit.id, id: audit.siteId }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 no-underline transition hover:bg-slate-100 hover:text-slate-900"
                    title="Ver detalle"
                  >
                    Detalle
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
