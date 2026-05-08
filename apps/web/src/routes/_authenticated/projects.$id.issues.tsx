import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PaginatedResponse } from '@seotracker/shared-types';
import { EmptyState } from '#/components/empty-state';
import { Pagination } from '#/components/pagination';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { CATEGORY_LABELS, getIssueCodeInfo } from '../../lib/issue-codes';
import { useAuth } from '../../lib/auth-context';
import { formatDisplayDate } from '../../lib/date-format';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type IssueState = 'OPEN' | 'IGNORED' | 'FIXED';

interface ProjectIssueRow {
  id: string;
  siteId: string;
  siteName: string;
  siteDomain: string;
  issueCode: string;
  category: string;
  severity: Severity;
  state: IssueState;
  occurrenceCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resourceKey: string | null;
}

interface SiteOption {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

const SEVERITY_TONE: Record<Severity, string> = {
  CRITICAL: 'bg-rose-50 text-rose-700',
  HIGH: 'bg-amber-50 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-sky-50 text-sky-700',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  LOW: 'Baja',
  MEDIUM: 'Media',
};

const STATE_LABEL: Record<IssueState, string> = {
  FIXED: 'Resuelta',
  IGNORED: 'Ignorada',
  OPEN: 'Abierta',
};

export const Route = createFileRoute('/_authenticated/projects/$id/issues')({
  component: ProjectIssuesPage,
});

function ProjectIssuesPage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const [severityFilter, setSeverityFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<IssueState>('OPEN');
  const [offset, setOffset] = useState(0);

  const sites = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () =>
      auth.api.get<PaginatedResponse<SiteOption>>(`/sites?projectId=${id}&limit=200&offset=0`),
    queryKey: ['sites-list', id],
  });

  const issues = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      params.set('state', stateFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (siteFilter) params.set('siteId', siteFilter);
      return auth.api.get<PaginatedResponse<ProjectIssueRow>>(
        `/projects/${id}/site-issues?${params.toString()}`,
      );
    },
    queryKey: ['project-issues', id, severityFilter, siteFilter, stateFilter, offset],
  });

  const items = issues.data?.items ?? [];
  const total = issues.data?.total ?? 0;

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
          Incidencias
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Vista agregada de incidencias detectadas en el proyecto. Prioriza por severidad y dominio.
        </p>
      </header>

      <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 sm:p-6">
        <div
          role="tablist"
          aria-label="Estado"
          className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium"
        >
          <StateTab
            active={stateFilter === 'OPEN'}
            onClick={() => {
              setStateFilter('OPEN');
              resetOffset();
            }}
          >
            Abiertas
          </StateTab>
          <StateTab
            active={stateFilter === 'IGNORED'}
            onClick={() => {
              setStateFilter('IGNORED');
              resetOffset();
            }}
          >
            Ignoradas
          </StateTab>
          <StateTab
            active={stateFilter === 'FIXED'}
            onClick={() => {
              setStateFilter('FIXED');
              resetOffset();
            }}
          >
            Resueltas
          </StateTab>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
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
              value={severityFilter}
              onValueChange={(value) => {
                setSeverityFilter(value);
                resetOffset();
              }}
              placeholder="Severidad"
              triggerClassName="min-w-36 py-1.5 text-xs"
              options={[
                { label: 'Todas', value: '' },
                { label: 'Crítica', value: 'CRITICAL' },
                { label: 'Alta', value: 'HIGH' },
                { label: 'Media', value: 'MEDIUM' },
                { label: 'Baja', value: 'LOW' },
              ]}
            />
          </div>
          <Pagination
            total={total}
            offset={offset}
            pageSize={PAGE_SIZE}
            onChange={setOffset}
            itemLabel="incidencias"
          />
        </div>

        {issues.isLoading ? (
          <ul className="mt-4 space-y-3">
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className="h-14 rounded-md" />
          </ul>
        ) : items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={
                stateFilter === 'OPEN'
                  ? 'Sin incidencias abiertas'
                  : `Sin incidencias ${STATE_LABEL[stateFilter].toLowerCase()}`
              }
              description={
                stateFilter === 'OPEN'
                  ? 'Todos los dominios del proyecto están limpios para esta selección.'
                  : 'No hay registros para los filtros aplicados.'
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((issue) => {
              const info = getIssueCodeInfo(issue.issueCode);
              return (
                <li key={issue.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[issue.severity]}`}
                        >
                          {SEVERITY_LABEL[issue.severity]}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {CATEGORY_LABELS[issue.category] ?? issue.category}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {issue.issueCode}
                        </span>
                        {issue.occurrenceCount > 1 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            ×{issue.occurrenceCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-slate-900">{info.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Link
                          to="/sites/$id"
                          params={{ id: issue.siteId }}
                          className="font-medium text-slate-700 no-underline hover:text-brand-600"
                        >
                          {issue.siteName}
                        </Link>
                        <span className="font-mono">{issue.siteDomain}</span>
                        {issue.lastSeenAt ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              Vista por última vez {formatDisplayDate(issue.lastSeenAt)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <Link
                      to="/sites/$id"
                      params={{ id: issue.siteId }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 no-underline transition hover:bg-slate-100 hover:text-slate-900"
                      title="Abrir dominio"
                    >
                      Abrir
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}

function StateTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-md px-3 py-1.5 transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
