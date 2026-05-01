import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, RefreshCw, Timer, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { pollWhileAuditActive } from '../../lib/refetch-intervals';

import { EmptyState } from '#/components/empty-state';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMetricValue,
  httpStatusTone,
  humanizeMetric,
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

import { useToast } from '../../components/toast';
import { useAuth } from '../../lib/auth-context';

export const Route = createFileRoute('/_authenticated/sites_/$id/audits/$auditId')({
  component: AuditDetailPage,
});

function AuditDetailPage() {
  const { id, auditId } = Route.useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const audit = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => auth.api.get<AuditRun>(`/audits/${auditId}`),
    enabled: Boolean(auth.accessToken),
    refetchInterval: pollWhileAuditActive,
  });

  const isAuditActive = audit.data?.status === 'QUEUED' || audit.data?.status === 'RUNNING';

  const issues = useQuery({
    queryKey: ['audit-issues', auditId],
    queryFn: () => auth.api.get<AuditIssue[]>(`/audits/${auditId}/issues`),
    enabled: Boolean(auth.accessToken) && !isAuditActive,
  });

  const createExport = useMutation({
    mutationFn: (kind: ExportKind) =>
      auth.api.post(`/sites/${id}/exports`, {
        kind,
        format: 'CSV',
        auditRunId: auditId,
      }),
  });

  const rerunAudit = useMutation({
    mutationFn: () => auth.api.post<{ id: string }>(`/sites/${id}/audits/run`),
    onSuccess: (data) => {
      toast.success(
        'Auditoría relanzada',
        'Se ejecutará en segundo plano. Te redirigimos a la nueva ejecución.',
      );
      if (data?.id) {
        navigate({
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
      queryClient.invalidateQueries({ queryKey: ['audit-issues', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
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
      queryClient.invalidateQueries({ queryKey: ['audit-issues', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
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
  const issueData = issues.data;
  const [drawerGroup, setDrawerGroup] = useState<IssueGroup | null>(null);

  const issuesBySeverity = useMemo(() => groupIssuesBySeverity(issueData ?? []), [issueData]);

  const durationMs = useMemo(() => {
    if (!runData?.startedAt || !runData?.finishedAt) return null;
    return new Date(runData.finishedAt).getTime() - new Date(runData.startedAt).getTime();
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

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
              <ScoreCard
                score={runData.score}
                previousScore={runData.previousScore}
                scoreDelta={runData.scoreDelta}
              />
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
            </div>
            {runData.categoryScores ? <CategoryScoreStrip scores={runData.categoryScores} /> : null}
            <SeverityBreakdown counts={runData.severityCounts} total={runData.issuesCount} />
            {runData.scoreBreakdown ? (
              <ScoreBreakdownPanel breakdown={runData.scoreBreakdown} baseScore={runData.score} />
            ) : null}
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">
                  Incidencias detectadas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Agrupadas por severidad para priorizar lo más crítico primero.
                </p>
              </div>
            </div>

            {issues.isLoading ? (
              <p className="mt-5 text-sm text-slate-500">Cargando incidencias…</p>
            ) : !issueData?.length ? (
              <div className="mt-5">
                <EmptyState
                  title="Sin incidencias"
                  description="Este dominio está limpio en esta auditoría. Revisa las páginas para confirmar que el rastreo alcanzó el contenido esperado."
                />
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                  const groups = issuesBySeverity[sev];
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
                            <IssueGroupCard group={group} onOpen={() => setDrawerGroup(group)} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </article>

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
                        {formatMetricValue(metric.valueNum, metric.valueText)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CollapsibleSection>
          </div>

          <IssueDetailDrawer
            group={drawerGroup}
            onClose={() => setDrawerGroup(null)}
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
    const firstSeen = group.items.map((i) => i.firstSeenAt).filter((v): v is string => Boolean(v));
    group.firstSeenAt =
      firstSeen.length > 0 ? firstSeen.reduce((a, b) => (new Date(a) < new Date(b) ? a : b)) : null;
    const lastSeen = group.items.map((i) => i.lastSeenAt).filter((v): v is string => Boolean(v));
    group.lastSeenAt =
      lastSeen.length > 0 ? lastSeen.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null;
    buckets[group.severity]?.push(group);
  }
  for (const sev of Object.keys(buckets) as Severity[]) {
    buckets[sev].sort((a, b) => b.items.length - a.items.length);
  }
  return buckets;
}
