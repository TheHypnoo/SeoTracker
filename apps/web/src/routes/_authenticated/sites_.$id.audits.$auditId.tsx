import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@seotracker/shared-types';
import { ArrowLeft, ChevronDown, Clock, RefreshCw, Timer, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { pollWhileAuditActive } from '../../lib/refetch-intervals';

import { EmptyState } from '#/components/empty-state';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMetricValue,
  httpStatusTone,
  humanizeMetric,
  isRatioMetric,
} from '#/components/audit-detail/audit-detail-formatters';
import type {
  AuditIssue,
  AuditRun,
  ExportKind,
  IssueGroup,
  IssueState,
  Severity,
} from '#/components/audit-detail/audit-detail-types';
import {
  HttpStatusPill,
  InlineStat,
  PageScorePill,
  SeverityChip,
  StatusBadge,
  TriggerBadge,
} from '#/components/audit-detail/badges';
import { CollapsibleSection } from '#/components/audit-detail/collapsible-section';
import { ExportMenu } from '#/components/audit-detail/export-menu';
import { IssueDetailDrawer } from '#/components/audit-detail/issue-detail-drawer';
import { IssueGroupCard } from '#/components/audit-detail/issue-group-card';
import {
  CategoryScoreStrip,
  ScoreBreakdownPanel,
  ScoreCard,
  SeverityBreakdown,
} from '#/components/audit-detail/score-cards';
import {
  AuditKeyFindingsPanel,
  type SeoActionPlanPayload,
} from '#/components/seo-action-plan-panel';

import { useToast } from '../../components/toast';
import { useAuth } from '../../lib/auth-context';
import { toTimestamp } from '../../lib/date-format';
import { getIssueCodeInfo } from '../../lib/issue-codes';

export const Route = createFileRoute('/_authenticated/sites_/$id/audits/$auditId')({
  component: AuditDetailPage,
});

const ISSUE_GROUPS_PER_PAGE = 8;
const INDEXABILITY_PAGE_SIZE = 25;
const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const INDEXABILITY_STATUSES: IndexabilityStatus[] = [
  'INDEXABLE',
  'NOINDEX',
  'BLOCKED_BY_ROBOTS',
  'CANONICALIZED',
  'HTTP_ERROR',
  'PRIVATE_EXPECTED',
  'UNKNOWN',
];
const INDEXABILITY_SOURCES = ['homepage', 'crawl', 'sitemap', 'head', 'probe'] as const;
type AuditTab = 'action-plan' | 'technical';
type IndexabilityStatus =
  | 'INDEXABLE'
  | 'NOINDEX'
  | 'BLOCKED_BY_ROBOTS'
  | 'CANONICALIZED'
  | 'HTTP_ERROR'
  | 'PRIVATE_EXPECTED'
  | 'UNKNOWN';

type UrlInspection = {
  id: string;
  url: string;
  source: string;
  statusCode: number | null;
  indexabilityStatus: IndexabilityStatus;
  canonicalUrl: string | null;
  robotsDirective: string | null;
  xRobotsTag: string | null;
  sitemapIncluded: boolean;
  evidence: Record<string, unknown>;
};

function useAuditDetailUiState() {
  return {
    drawerGroupState: useState<IssueGroup | null>(null),
    issueSearchState: useState(''),
    severityFilterState: useState<Severity | 'ALL'>('ALL'),
    stateFilterState: useState<IssueState | 'ALL'>('ALL'),
    issuePageState: useState(1),
    auditTabState: useState<AuditTab>('action-plan'),
    indexabilityStatusFilterState: useState<IndexabilityStatus | 'ALL'>('ALL'),
    indexabilitySourceFilterState: useState<string>('ALL'),
    indexabilityPageState: useState(1),
    scoreDetailsOpenState: useState(false),
  };
}

function AuditDetailPage() {
  const { id, auditId } = Route.useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const goToAudit = navigate;
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    drawerGroupState,
    issueSearchState,
    severityFilterState,
    stateFilterState,
    issuePageState,
    auditTabState,
    indexabilityStatusFilterState,
    indexabilitySourceFilterState,
    indexabilityPageState,
    scoreDetailsOpenState,
  } = useAuditDetailUiState();
  const [drawerGroup, setDrawerGroup] = drawerGroupState;
  const [issueSearch, setIssueSearch] = issueSearchState;
  const [severityFilter, setSeverityFilter] = severityFilterState;
  const [stateFilter, setStateFilter] = stateFilterState;
  const [issuePage, setIssuePage] = issuePageState;
  const [auditTab, setAuditTab] = auditTabState;
  const [indexabilityStatusFilter, setIndexabilityStatusFilter] = indexabilityStatusFilterState;
  const [indexabilitySourceFilter, setIndexabilitySourceFilter] = indexabilitySourceFilterState;
  const [indexabilityPage, setIndexabilityPage] = indexabilityPageState;
  const [scoreDetailsOpen, setScoreDetailsOpen] = scoreDetailsOpenState;

  const audit = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => auth.api.get<AuditRun>(`/audits/${auditId}`),
    enabled: Boolean(auth.accessToken),
    refetchInterval: pollWhileAuditActive,
  });

  const isAuditActive = audit.data?.status === 'QUEUED' || audit.data?.status === 'RUNNING';

  const issues = useQuery({
    queryKey: ['audit-issues', auditId],
    queryFn: () => auth.api.get<PaginatedResponse<AuditIssue>>(`/audits/${auditId}/issues`),
    enabled: Boolean(auth.accessToken) && !isAuditActive,
  });

  const actionPlan = useQuery({
    queryKey: ['audit-action-plan', auditId],
    queryFn: () => auth.api.get<SeoActionPlanPayload>(`/audits/${auditId}/action-plan`),
    enabled:
      Boolean(auth.accessToken) &&
      !isAuditActive &&
      audit.data?.status !== 'FAILED' &&
      Boolean(audit.data),
  });

  const indexability = useQuery({
    queryKey: [
      'audit-indexability',
      auditId,
      indexabilityStatusFilter,
      indexabilitySourceFilter,
      indexabilityPage,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(INDEXABILITY_PAGE_SIZE),
        offset: String((indexabilityPage - 1) * INDEXABILITY_PAGE_SIZE),
      });
      if (indexabilityStatusFilter !== 'ALL') {
        params.set('indexabilityStatus', indexabilityStatusFilter);
      }
      if (indexabilitySourceFilter !== 'ALL') {
        params.set('source', indexabilitySourceFilter);
      }
      return auth.api.get<PaginatedResponse<UrlInspection>>(
        `/audits/${auditId}/indexability?${params.toString()}`,
      );
    },
    enabled:
      Boolean(auth.accessToken) &&
      !isAuditActive &&
      audit.data?.status !== 'FAILED' &&
      Boolean(audit.data),
  });

  const createExport = useMutation({
    mutationFn: (kind: ExportKind) =>
      auth.api.post(`/sites/${id}/exports`, {
        kind,
        format: 'CSV',
        auditRunId: auditId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exports', id] });
      queryClient.invalidateQueries({ queryKey: ['site', id] });
    },
  });

  const rerunAudit = useMutation({
    mutationFn: () => auth.api.post<{ id: string }>(`/sites/${id}/audits/run`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      queryClient.invalidateQueries({ queryKey: ['site-audits', id] });
      toast.success(
        'Auditoría relanzada',
        'Se ejecutará en segundo plano. Te redirigimos a la nueva ejecución.',
      );
      if (data?.id) {
        goToAudit({
          to: '/sites/$id/audits/$auditId',
          params: { id, auditId: data.id },
        });
      }
    },
    onError: (error) => {
      toast.error('No se pudo relanzar la auditoría', String((error as Error)?.message ?? error));
    },
  });

  const bulkUpdateIssueState = useMutation({
    mutationFn: async (args: { projectIssueIds: string[]; state: IssueState }) => {
      await Promise.all(
        args.projectIssueIds.map((projectIssueId) =>
          auth.api.patch(`/site-issues/${projectIssueId}/state`, { state: args.state }),
        ),
      );
    },
    onSuccess: (_data, variables) => {
      setDrawerGroup((current) =>
        updateIssueGroupState(current, variables.projectIssueIds, variables.state),
      );
      queryClient.invalidateQueries({ queryKey: ['audit-issues', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit-action-plan', auditId] });
      toast.success(
        variables.state === 'IGNORED' ? 'Incidencias ignoradas' : 'Incidencias reactivadas',
        `${variables.projectIssueIds.length} ${
          variables.projectIssueIds.length === 1 ? 'registro afectado' : 'registros afectados'
        }.`,
      );
    },
    onError: (error) => {
      toast.error('Acción masiva fallida', String((error as Error)?.message ?? error));
    },
  });

  const updateIssueState = useMutation({
    mutationFn: ({ projectIssueId, state }: { projectIssueId: string; state: IssueState }) =>
      auth.api.patch(`/site-issues/${projectIssueId}/state`, { state }),
    onSuccess: (_data, variables) => {
      setDrawerGroup((current) =>
        updateIssueGroupState(current, [variables.projectIssueId], variables.state),
      );
      queryClient.invalidateQueries({ queryKey: ['audit-issues', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit-action-plan', auditId] });
      toast.success(
        variables.state === 'IGNORED' ? 'Incidencia ignorada' : 'Incidencia reactivada',
        variables.state === 'IGNORED'
          ? 'No afectará al score de próximas auditorías mientras permanezca ignorada.'
          : 'Volverá a contar para el score.',
      );
    },
    onError: (error) => {
      toast.error('No se pudo cambiar el estado', String((error as Error)?.message ?? error));
    },
  });

  const runData = audit.data;
  const showTechnicalSections = runData?.status !== 'COMPLETED' || auditTab === 'technical';
  const issueData = useMemo(() => issues.data?.items ?? [], [issues.data?.items]);
  const allIssuesBySeverity = useMemo(() => groupIssuesBySeverity(issueData), [issueData]);
  const filteredIssueData = useMemo(
    () => filterIssues(issueData, issueSearch, severityFilter, stateFilter),
    [issueData, issueSearch, severityFilter, stateFilter],
  );
  const issuesBySeverity = useMemo(
    () => groupIssuesBySeverity(filteredIssueData),
    [filteredIssueData],
  );
  const issueGroups = useMemo(() => {
    return SEVERITY_ORDER.flatMap((severity) =>
      issuesBySeverity[severity].map((group) => ({ group, severity })),
    );
  }, [issuesBySeverity]);
  const totalIssuePages = Math.max(1, Math.ceil(issueGroups.length / ISSUE_GROUPS_PER_PAGE));
  const currentIssuePage = Math.min(issuePage, totalIssuePages);
  const paginatedIssuesBySeverity = useMemo(() => {
    const start = (currentIssuePage - 1) * ISSUE_GROUPS_PER_PAGE;
    const pageGroups = issueGroups.slice(start, start + ISSUE_GROUPS_PER_PAGE);
    const buckets: Record<Severity, IssueGroup[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const item of pageGroups) {
      buckets[item.severity].push(item.group);
    }
    return buckets;
  }, [currentIssuePage, issueGroups]);
  const promptByIssueCode = useMemo(() => {
    return new Map((actionPlan.data?.actions ?? []).map((action) => [action.issueCode, action]));
  }, [actionPlan.data?.actions]);
  const drawerGroupCode = drawerGroup?.code ?? null;

  useEffect(() => {
    if (!drawerGroupCode) return;
    const freshGroup = findIssueGroup(allIssuesBySeverity, drawerGroupCode);
    if (freshGroup) {
      setDrawerGroup(freshGroup);
    }
  }, [allIssuesBySeverity, drawerGroupCode, setDrawerGroup]);

  const durationMs = useMemo(() => {
    if (!runData?.startedAt || !runData?.finishedAt) return null;
    return toTimestamp(runData.finishedAt) - toTimestamp(runData.startedAt);
  }, [runData?.startedAt, runData?.finishedAt]);

  return (
    <section className="space-y-6">
      <div>
        <Link
          to="/sites/$id"
          params={{ id }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 no-underline hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Volver al dominio
        </Link>
      </div>

      {!runData ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Cargando detalle de auditoría...
        </article>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                <span>{runData.site.name}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono normal-case tracking-normal text-slate-400">
                  {runData.site.domain}
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                Auditoría del{' '}
                {formatDate(runData.startedAt ?? runData.createdAt, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <StatusBadge status={runData.status} />
                <TriggerBadge trigger={runData.trigger} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <Clock size={12} aria-hidden="true" />
                  {runData.startedAt ? formatDateTime(runData.startedAt) : 'Sin iniciar'}
                </span>
                {durationMs !== null ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    <Timer size={12} aria-hidden="true" />
                    {formatDuration(durationMs)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => rerunAudit.mutate()}
                disabled={rerunAudit.isPending || isAuditActive}
                className="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
                title={
                  isAuditActive
                    ? 'Ya hay una auditoría en curso.'
                    : 'Relanza una auditoría manual ahora mismo.'
                }
              >
                <RefreshCw
                  size={14}
                  className={rerunAudit.isPending ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
                {rerunAudit.isPending ? 'Lanzando…' : 'Volver a auditar'}
              </button>
              <ExportMenu
                onSelect={(kind) => createExport.mutate(kind)}
                disabled={createExport.isPending}
              />
            </div>
          </header>

          {runData.status === 'FAILED' ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <XCircle size={20} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-rose-900">La auditoría falló</h2>
                  <p className="mt-1 text-sm text-rose-800">
                    {runData.failureReason ??
                      'No se registró un motivo específico. Revisa los logs del sistema.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <ScoreCard
                  score={runData.score}
                  previousScore={runData.previousScore}
                  scoreDelta={runData.scoreDelta}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <InlineStat
                  label="Incidencias"
                  value={String(runData.issuesCount)}
                  tone={runData.issuesCount > 0 ? 'warning' : 'neutral'}
                />
                <InlineStat
                  label="HTTP"
                  value={runData.httpStatus !== null ? String(runData.httpStatus) : '--'}
                  tone={httpStatusTone(runData.httpStatus)}
                />
                <InlineStat
                  label="Respuesta"
                  value={runData.responseMs !== null ? `${runData.responseMs} ms` : '--'}
                />
                <InlineStat
                  label="Duración"
                  value={durationMs !== null ? formatDuration(durationMs) : '--'}
                />
              </div>
              <button
                type="button"
                aria-expanded={scoreDetailsOpen}
                aria-controls="audit-score-context"
                onClick={() => setScoreDetailsOpen((open) => !open)}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span>Detalle del score</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${
                    scoreDetailsOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>
            {scoreDetailsOpen ? (
              <div id="audit-score-context">
                {runData.categoryScores ? (
                  <CategoryScoreStrip scores={runData.categoryScores} />
                ) : null}
                <SeverityBreakdown counts={runData.severityCounts} total={runData.issuesCount} />
                {runData.scoreBreakdown ? (
                  <ScoreBreakdownPanel
                    breakdown={runData.scoreBreakdown}
                    baseScore={runData.score}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {runData.status === 'COMPLETED' ? (
            <>
              <AuditTabs value={auditTab} onChange={setAuditTab} />
              {auditTab === 'action-plan' ? (
                <AuditKeyFindingsPanel
                  plan={actionPlan.data ?? null}
                  loading={actionPlan.isLoading || actionPlan.isFetching}
                />
              ) : (
                <IndexabilityPanel
                  inspections={indexability.data?.items ?? []}
                  total={indexability.data?.total ?? 0}
                  currentPage={indexabilityPage}
                  pageSize={INDEXABILITY_PAGE_SIZE}
                  statusFilter={indexabilityStatusFilter}
                  sourceFilter={indexabilitySourceFilter}
                  loading={indexability.isLoading || indexability.isFetching}
                  onStatusFilterChange={(value) => {
                    setIndexabilityStatusFilter(value);
                    setIndexabilityPage(1);
                  }}
                  onSourceFilterChange={(value) => {
                    setIndexabilitySourceFilter(value);
                    setIndexabilityPage(1);
                  }}
                  onPageChange={setIndexabilityPage}
                />
              )}
            </>
          ) : null}

          {showTechnicalSections ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-950">
                    Incidencias técnicas
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Listado técnico completo. Usa el plan superior para decidir prioridades.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {filteredIssueData.length}/{issueData.length} visibles
                </span>
              </div>

              {issueData.length > 0 ? (
                <div className="mt-5 grid gap-3 md:grid-cols-[minmax(260px,1fr)_minmax(220px,240px)_minmax(180px,220px)]">
                  <label className="block">
                    <span className="sr-only">Buscar incidencias</span>
                    <input
                      type="search"
                      value={issueSearch}
                      onChange={(event) => {
                        setIssueSearch(event.target.value);
                        setIssuePage(1);
                      }}
                      placeholder="Buscar por tipo, mensaje o URL"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">Filtrar por severidad</span>
                    <select
                      value={severityFilter}
                      onChange={(event) => {
                        setSeverityFilter(event.target.value as Severity | 'ALL');
                        setIssuePage(1);
                      }}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                    >
                      <option value="ALL">Todas las severidades</option>
                      <option value="CRITICAL">Críticas</option>
                      <option value="HIGH">Altas</option>
                      <option value="MEDIUM">Medias</option>
                      <option value="LOW">Bajas</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">Filtrar por estado</span>
                    <select
                      value={stateFilter}
                      onChange={(event) => {
                        setStateFilter(event.target.value as IssueState | 'ALL');
                        setIssuePage(1);
                      }}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                    >
                      <option value="ALL">Todos los estados</option>
                      <option value="OPEN">Abiertas</option>
                      <option value="IGNORED">Ignoradas</option>
                      <option value="FIXED">Resueltas</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {issues.isLoading ? (
                <p className="mt-5 text-sm text-slate-500">Cargando incidencias…</p>
              ) : !issueData?.length ? (
                <div className="mt-5">
                  <EmptyState
                    title="Sin incidencias"
                    description="Este dominio está limpio en esta auditoría. Revisa las páginas para confirmar que el rastreo alcanzó el contenido esperado."
                  />
                </div>
              ) : filteredIssueData.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="Sin coincidencias"
                    description="No hay incidencias que encajen con la búsqueda o los filtros actuales."
                  />
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {SEVERITY_ORDER.map((sev) => {
                    const groups = paginatedIssuesBySeverity[sev];
                    if (groups.length === 0) return null;
                    const total = groups.reduce((acc, g) => acc + g.items.length, 0);
                    return (
                      <section key={sev} className="space-y-3">
                        <header className="flex items-center gap-2">
                          <SeverityChip severity={sev} />
                          <span className="text-xs font-semibold text-slate-500">
                            {total} {total === 1 ? 'incidencia' : 'incidencias'} · {groups.length}{' '}
                            {groups.length === 1 ? 'tipo' : 'tipos'}
                          </span>
                        </header>
                        <ul className="space-y-2">
                          {groups.map((group) => (
                            <li key={group.code}>
                              <IssueGroupCard
                                group={group}
                                onOpen={() => setDrawerGroup(group)}
                                remediationPrompt={
                                  promptByIssueCode.get(group.code)?.remediationPrompt ?? null
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                  {issueGroups.length > ISSUE_GROUPS_PER_PAGE ? (
                    <IssuePagination
                      currentPage={issuePage}
                      pageSize={ISSUE_GROUPS_PER_PAGE}
                      totalGroups={issueGroups.length}
                      totalPages={totalIssuePages}
                      onPageChange={setIssuePage}
                    />
                  ) : null}
                </div>
              )}
            </article>
          ) : null}

          {showTechnicalSections ? (
            <div className="space-y-3">
              <CollapsibleSection title="Páginas analizadas" count={runData.pages.length}>
                {runData.pages.length === 0 ? (
                  <p className="text-sm text-slate-500">No se registraron páginas.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {runData.pages.map((page) => (
                      <li key={page.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <HttpStatusPill status={page.statusCode} />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
                          {page.url}
                        </span>
                        <PageScorePill score={page.score} />
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500">
                          <Timer size={10} aria-hidden="true" />
                          {page.responseMs ?? '--'} ms
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="Métricas SEO" count={runData.metrics.length}>
                {runData.metrics.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin métricas registradas.</p>
                ) : (
                  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {runData.metrics.map((metric) => (
                      <div
                        key={metric.id}
                        className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5"
                      >
                        <dt className="text-sm text-slate-600">{humanizeMetric(metric.key)}</dt>
                        <dd className="text-sm font-semibold tabular-nums text-slate-900">
                          {isRatioMetric(metric.key) && metric.valueNum !== null
                            ? `${Math.round(metric.valueNum * 100)}%`
                            : formatMetricValue(metric.valueNum, metric.valueText)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CollapsibleSection>
            </div>
          ) : null}

          <IssueDetailDrawer
            group={drawerGroup}
            onClose={() => setDrawerGroup(null)}
            evidenceSummary={
              drawerGroup
                ? (promptByIssueCode.get(drawerGroup.code)?.evidenceSummary ?? null)
                : null
            }
            remediationPrompt={
              drawerGroup
                ? (promptByIssueCode.get(drawerGroup.code)?.remediationPrompt ?? null)
                : null
            }
            onChangeState={(projectIssueId, state) =>
              updateIssueState.mutate({ projectIssueId, state })
            }
            onBulkChangeState={(projectIssueIds, state) =>
              bulkUpdateIssueState.mutate({ projectIssueIds, state })
            }
            isPending={updateIssueState.isPending || bulkUpdateIssueState.isPending}
          />
        </>
      )}
    </section>
  );
}

function IssuePagination({
  currentPage,
  totalPages,
  totalGroups,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalGroups: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalGroups);
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
      aria-label="Paginación de incidencias técnicas"
    >
      <p className="text-xs font-semibold text-slate-500">
        Tipos {start}-{end} de {totalGroups}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="min-w-16 text-center text-xs font-bold text-slate-500">
          {currentPage}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

function AuditTabs({ value, onChange }: { value: AuditTab; onChange: (value: AuditTab) => void }) {
  const tabs: Array<{ id: AuditTab; label: string }> = [
    { id: 'action-plan', label: 'Plan de acción' },
    { id: 'technical', label: 'Diagnóstico técnico' },
  ];
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function IndexabilityPanel({
  inspections,
  loading,
  total,
  currentPage,
  pageSize,
  statusFilter,
  sourceFilter,
  onStatusFilterChange,
  onSourceFilterChange,
  onPageChange,
}: {
  inspections: UrlInspection[];
  loading: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  statusFilter: IndexabilityStatus | 'ALL';
  sourceFilter: string;
  onStatusFilterChange: (value: IndexabilityStatus | 'ALL') => void;
  onSourceFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = statusFilter !== 'ALL' || sourceFilter !== 'ALL';

  if (loading) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Cargando diagnóstico de indexabilidad...
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-slate-950">
              Matriz de indexabilidad
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Cruce de estado HTTP, sitemap, robots, canonical y política interna de URLs privadas.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {total} URLs
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(200px,240px)_minmax(180px,220px)_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Estado</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(event.target.value as IndexabilityStatus | 'ALL')
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            >
              <option value="ALL">Todos los estados</option>
              {INDEXABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {indexabilityStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Fuente</span>
            <select
              value={sourceFilter}
              onChange={(event) => onSourceFilterChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            >
              <option value="ALL">Todas las fuentes</option>
              {INDEXABILITY_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                onStatusFilterChange('ALL');
                onSourceFilterChange('ALL');
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </div>

      {inspections.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={hasFilters ? 'Sin URLs para estos filtros' : 'Sin diagnóstico de indexabilidad'}
            description={
              hasFilters
                ? 'No hay URLs que coincidan con el estado o la fuente seleccionados.'
                : 'Esta auditoría no tiene todavía la matriz técnica por URL. Las auditorías nuevas la generarán automáticamente.'
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">HTTP</th>
                  <th className="px-4 py-3">Fuente</th>
                  <th className="px-4 py-3">Sitemap</th>
                  <th className="px-4 py-3">Canonical / robots</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inspections.map((inspection) => (
                  <tr key={inspection.id} className="align-top">
                    <td className="max-w-md px-4 py-3">
                      <div className="break-all font-mono text-xs leading-5 text-slate-700">
                        {inspection.url}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {typeof inspection.evidence?.reason === 'string'
                          ? inspection.evidence.reason
                          : indexabilityStatusLabel(inspection.indexabilityStatus)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <IndexabilityPill status={inspection.indexabilityStatus} />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                      {inspection.statusCode ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">
                      {inspection.source}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">
                      {inspection.sitemapIncluded ? 'Sí' : 'No'}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-xs leading-5 text-slate-600">
                      {inspection.canonicalUrl ? (
                        <div className="break-all">
                          <span className="font-bold">Canonical:</span> {inspection.canonicalUrl}
                        </div>
                      ) : null}
                      {inspection.robotsDirective ? (
                        <div className="break-all">
                          <span className="font-bold">Robots:</span> {inspection.robotsDirective}
                        </div>
                      ) : null}
                      {inspection.xRobotsTag ? (
                        <div className="break-all">
                          <span className="font-bold">X-Robots:</span> {inspection.xRobotsTag}
                        </div>
                      ) : null}
                      {!inspection.canonicalUrl &&
                      !inspection.robotsDirective &&
                      !inspection.xRobotsTag
                        ? '--'
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <IndexabilityPagination
            currentPage={currentPage}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      )}
    </article>
  );
}

function IndexabilityPagination({
  currentPage,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  return (
    <nav
      aria-label="Paginación de indexabilidad"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"
    >
      <p className="text-xs font-semibold text-slate-500">
        URLs {start}-{end} de {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="min-w-16 text-center text-xs font-bold text-slate-500">
          {currentPage}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

function IndexabilityPill({ status }: { status: IndexabilityStatus }) {
  const tone =
    status === 'INDEXABLE'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'PRIVATE_EXPECTED'
        ? 'bg-slate-100 text-slate-700'
        : status === 'UNKNOWN'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-rose-100 text-rose-800';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
      {indexabilityStatusLabel(status)}
    </span>
  );
}

function indexabilityStatusLabel(status: IndexabilityStatus) {
  if (status === 'INDEXABLE') return 'Indexable';
  if (status === 'NOINDEX') return 'Noindex';
  if (status === 'BLOCKED_BY_ROBOTS') return 'Bloqueada por robots';
  if (status === 'CANONICALIZED') return 'Canonicalizada';
  if (status === 'HTTP_ERROR') return 'Error HTTP';
  if (status === 'PRIVATE_EXPECTED') return 'Privada esperada';
  return 'Desconocida';
}

function findIssueGroup(buckets: Record<Severity, IssueGroup[]>, code: string): IssueGroup | null {
  for (const groups of Object.values(buckets)) {
    for (const group of groups) {
      if (group.code === code) return group;
    }
  }
  return null;
}

function filterIssues(
  issues: AuditIssue[],
  search: string,
  severityFilter: Severity | 'ALL',
  stateFilter: IssueState | 'ALL',
) {
  const query = search.trim().toLowerCase();
  return issues.filter((issue) => {
    if (severityFilter !== 'ALL' && issue.severity !== severityFilter) return false;
    const issueState = issue.state ?? 'OPEN';
    if (stateFilter !== 'ALL' && issueState !== stateFilter) return false;
    if (!query) return true;

    const info = getIssueCodeInfo(issue.issueCode);
    return [
      issue.issueCode,
      issue.message,
      issue.resourceUrl,
      issue.category,
      info.title,
      info.description,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });
}

function updateIssueGroupState(
  group: IssueGroup | null,
  projectIssueIds: string[],
  state: IssueState,
) {
  if (!group) return group;
  const ids = new Set(projectIssueIds);
  let changed = false;
  const items = group.items.map((item) => {
    if (!item.projectIssueId || !ids.has(item.projectIssueId)) return item;
    changed = true;
    return { ...item, state };
  });
  if (!changed) return group;
  return refreshIssueGroupState({ ...group, items });
}

function refreshIssueGroupState(group: IssueGroup) {
  return {
    ...group,
    anyIgnored: group.items.some((item) => item.state === 'IGNORED'),
    allIgnored: group.items.every((item) => item.state === 'IGNORED'),
  };
}

/**
 * Bucket flat issues into severity → list-of-groups, dedup'd by issueCode.
 * Each group surfaces ignore-state aggregates and first/last seen timestamps,
 * so the UI can show "Partially ignored" badges and "Detected first time
 * 5 days ago" without hitting the data again.
 */
function groupIssuesBySeverity(rows: AuditIssue[]): Record<Severity, IssueGroup[]> {
  const buckets: Record<Severity, IssueGroup[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const byCode = new Map<string, IssueGroup>();
  for (const issue of rows) {
    const existing = byCode.get(issue.issueCode);
    if (existing) {
      existing.items.push(issue);
    } else {
      byCode.set(issue.issueCode, {
        code: issue.issueCode,
        severity: issue.severity,
        category: issue.category,
        items: [issue],
        anyIgnored: false,
        allIgnored: false,
        firstSeenAt: null,
        lastSeenAt: null,
      });
    }
  }
  for (const group of byCode.values()) {
    group.anyIgnored = group.items.some((i) => i.state === 'IGNORED');
    group.allIgnored = group.items.every((i) => i.state === 'IGNORED');
    for (const item of group.items) {
      if (
        item.firstSeenAt &&
        (!group.firstSeenAt || toTimestamp(item.firstSeenAt) < toTimestamp(group.firstSeenAt))
      ) {
        group.firstSeenAt = item.firstSeenAt;
      }
      if (
        item.lastSeenAt &&
        (!group.lastSeenAt || toTimestamp(item.lastSeenAt) > toTimestamp(group.lastSeenAt))
      ) {
        group.lastSeenAt = item.lastSeenAt;
      }
    }
    buckets[group.severity]?.push(group);
  }
  for (const sev of Object.keys(buckets) as Severity[]) {
    buckets[sev].sort((a, b) => b.items.length - a.items.length);
  }
  return buckets;
}
