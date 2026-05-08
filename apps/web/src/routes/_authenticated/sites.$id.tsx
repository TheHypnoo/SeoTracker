import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileDown,
  Gauge,
  Pencil,
  Play,
  Save,
  Settings2,
  TrendingDown,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '#/components/button';
import { PublicBadgeCard } from '#/components/site-detail/public-badge-card';
import { CompareAuditsPanel } from '#/components/site-detail/comparisons';
import { TrendsPanel } from '#/components/site-detail/trends-panel';
import { Modal } from '#/components/modal';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { TextInput } from '#/components/text-input';
import type { PaginatedResponse } from '@seotracker/shared-types';

import { useAuth } from '../../lib/auth-context';
import { formatDisplayDate, formatDisplayDateTime } from '../../lib/date-format';
import { REFETCH_INTERVALS, pollWhileAnyAuditActive } from '../../lib/refetch-intervals';
import { getTimezoneOptions } from '../../lib/timezones';

type AuditRun = {
  id: string;
  trigger: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK';
  status: string;
  score: number | null;
  httpStatus: number | null;
  responseMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  issuesCount: number;
  criticalIssuesCount: number;
};

type Site = {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  projectId: string;
};

type Schedule = {
  frequency: 'DAILY' | 'WEEKLY';
  dayOfWeek: number | null;
  timeOfDay: string;
  timezone: string;
  enabled: boolean;
};

type ScheduleFormState = {
  frequency: 'DAILY' | 'WEEKLY';
  dayOfWeek: string;
  timeOfDay: string;
  timezone: string;
};

type AlertRule = {
  enabled: boolean;
  notifyOnScoreDrop: boolean;
  scoreDropThreshold: number;
  notifyOnNewCriticalIssues: boolean;
  notifyOnIssueCountIncrease: boolean;
};

type ComparisonItem = {
  id: string;
  baselineAuditRunId: string;
  targetAuditRunId: string;
  scoreDelta: number;
  issuesDelta: number;
  regressionsCount: number;
  improvementsCount: number;
  createdAt: string;
  baselineRun: {
    id: string;
    createdAt: string;
    score: number | null;
  } | null;
  targetRun: {
    id: string;
    createdAt: string;
    score: number | null;
  } | null;
};

type ComparisonDetail = {
  comparison: {
    id: string;
    scoreDelta: number;
    issuesDelta: number;
    regressionsCount: number;
    improvementsCount: number;
  };
  from: {
    run: { id: string; score: number | null; createdAt: string };
    severity: Record<string, number>;
  };
  to: {
    run: { id: string; score: number | null; createdAt: string };
    severity: Record<string, number>;
  };
  delta: { score: number; issues: number };
  summary: { regressionsCount: number; improvementsCount: number };
  changes: Array<{
    id?: string;
    changeType: string;
    title: string;
    severity: string | null;
    delta: number | null;
  }>;
};

type ComparisonPair = {
  fromId: string;
  toId: string;
};

type ProjectExport = {
  id: string;
  kind: string;
  format: string;
  status: string;
  createdAt: string;
  fileName: string | null;
};

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const Route = createFileRoute('/_authenticated/sites/$id')({
  component: ProjectDetailPage,
});

function useProjectDetailUiState() {
  return {
    scheduleModalOpenState: useState(false),
    scheduleFormState: useState<ScheduleFormState>({
      frequency: 'DAILY',
      dayOfWeek: '1',
      timeOfDay: '09:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    alertRuleState: useState<AlertRule>({
      enabled: true,
      notifyOnScoreDrop: true,
      scoreDropThreshold: 2,
      notifyOnNewCriticalIssues: true,
      notifyOnIssueCountIncrease: false,
    }),
    auditStatusFilterState: useState(''),
    auditTriggerFilterState: useState(''),
    comparisonPairState: useState<ComparisonPair | null>(null),
    compareModalOpenState: useState(false),
  };
}

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const {
    scheduleModalOpenState,
    scheduleFormState,
    alertRuleState,
    auditStatusFilterState,
    auditTriggerFilterState,
    comparisonPairState,
    compareModalOpenState,
  } = useProjectDetailUiState();
  const [scheduleModalOpen, setScheduleModalOpen] = scheduleModalOpenState;
  const [scheduleForm, setScheduleForm] = scheduleFormState;
  const [alertState, setAlertState] = alertRuleState;
  const [auditStatusFilter, setAuditStatusFilter] = auditStatusFilterState;
  const [auditTriggerFilter, setAuditTriggerFilter] = auditTriggerFilterState;
  const [comparisonPair, setComparisonPair] = comparisonPairState;
  const [compareModalOpen, setCompareModalOpen] = compareModalOpenState;

  const site = useQuery({
    queryKey: ['site', id],
    queryFn: () => auth.api.get<Site>(`/sites/${id}`),
    enabled: Boolean(auth.accessToken),
  });

  const audits = useQuery({
    queryKey: ['audits', id, auditStatusFilter, auditTriggerFilter],
    queryFn: () => {
      const search = new URLSearchParams();
      if (auditStatusFilter) search.set('status', auditStatusFilter);
      if (auditTriggerFilter) search.set('trigger', auditTriggerFilter);
      search.set('limit', '25');
      search.set('offset', '0');
      return auth.api.get<PaginatedResponse<AuditRun>>(`/sites/${id}/audits?${search.toString()}`);
    },
    enabled: Boolean(auth.accessToken),
    refetchInterval: pollWhileAnyAuditActive,
  });

  const auditItems = audits.data?.items ?? [];

  const completedAudits = useQuery({
    queryKey: ['audits-for-comparison', id],
    queryFn: () =>
      auth.api.get<PaginatedResponse<AuditRun>>(
        `/sites/${id}/audits?status=COMPLETED&limit=50&offset=0`,
      ),
    enabled: Boolean(auth.accessToken),
  });

  const activeCount = auditItems.filter(
    (item) => item.status === 'QUEUED' || item.status === 'RUNNING',
  ).length;
  const prevActiveCountRef = useRef(activeCount);
  useEffect(() => {
    if (prevActiveCountRef.current > 0 && activeCount < prevActiveCountRef.current) {
      void queryClient.invalidateQueries({ queryKey: ['site', id] });
      void queryClient.invalidateQueries({ queryKey: ['comparisons', id] });
      void queryClient.invalidateQueries({ queryKey: ['audits-for-comparison', id] });
    }
    prevActiveCountRef.current = activeCount;
  }, [activeCount, id, queryClient]);

  const schedule = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => auth.api.get<Schedule | null>(`/sites/${id}/schedule`),
    enabled: Boolean(auth.accessToken),
  });

  const alerts = useQuery({
    queryKey: ['alerts', id],
    queryFn: () => auth.api.get<AlertRule>(`/sites/${id}/alerts`),
    enabled: Boolean(auth.accessToken),
  });

  const comparisons = useQuery({
    queryKey: ['comparisons', id],
    queryFn: () =>
      auth.api.get<{ items: ComparisonItem[]; total: number; limit: number; offset: number }>(
        `/sites/${id}/comparisons`,
      ),
    enabled: Boolean(auth.accessToken),
  });

  const trends = useQuery({
    queryKey: ['trends', id],
    queryFn: () =>
      auth.api.get<{
        points: Array<{
          id: string;
          timestamp: string;
          score: number | null;
          categoryScores: Record<string, number> | null;
          scoreDelta: number | null;
        }>;
      }>(`/sites/${id}/audits/trends?limit=30`),
    enabled: Boolean(auth.accessToken),
  });

  const exportsQuery = useQuery({
    queryKey: ['exports', id],
    queryFn: () =>
      auth.api.get<{ items: ProjectExport[]; total: number; limit: number; offset: number }>(
        `/sites/${id}/exports`,
      ),
    enabled: Boolean(auth.accessToken),
    refetchInterval: REFETCH_INTERVALS.OPERATIONAL_STATUS_MS,
  });

  const comparison = useQuery({
    queryKey: ['comparison-detail', id, comparisonPair?.fromId, comparisonPair?.toId],
    queryFn: () =>
      auth.api.get<ComparisonDetail>(
        `/sites/${id}/audits/compare?from=${encodeURIComponent(comparisonPair?.fromId ?? '')}&to=${encodeURIComponent(comparisonPair?.toId ?? '')}`,
      ),
    enabled: Boolean(auth.accessToken && comparisonPair),
  });

  const runAudit = useMutation({
    mutationFn: () => auth.api.post(`/sites/${id}/audits/run`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['audits', id] }),
        queryClient.invalidateQueries({ queryKey: ['comparisons', id] }),
        queryClient.invalidateQueries({ queryKey: ['audits-for-comparison', id] }),
      ]);
    },
  });

  const saveSchedule = useMutation({
    mutationFn: () =>
      auth.api.put(`/sites/${id}/schedule`, {
        frequency: scheduleForm.frequency,
        dayOfWeek: scheduleForm.frequency === 'WEEKLY' ? Number(scheduleForm.dayOfWeek) : undefined,
        timeOfDay: scheduleForm.timeOfDay,
        timezone: scheduleForm.timezone,
        enabled: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedule', id] });
      setScheduleModalOpen(false);
    },
  });

  const saveAlerts = useMutation({
    mutationFn: () => auth.api.put(`/sites/${id}/alerts`, alertState),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alerts', id] });
    },
  });

  const createExport = useMutation({
    mutationFn: (payload: {
      kind: string;
      auditRunId?: string;
      comparisonId?: string;
      filters?: Record<string, unknown>;
    }) => auth.api.post(`/sites/${id}/exports`, { ...payload, format: 'CSV' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exports', id] });
    },
  });

  const latestAudit = auditItems[0] ?? null;
  const latestComparison = comparisons.data?.items?.[0] ?? null;

  useEffect(() => {
    if (alerts.data && !saveAlerts.isPending) {
      setAlertState(alerts.data);
    }
  }, [alerts.data, saveAlerts.isPending, setAlertState]);

  useEffect(() => {
    if (schedule.data && !saveSchedule.isPending) {
      setScheduleForm({
        frequency: schedule.data.frequency,
        dayOfWeek: String(schedule.data.dayOfWeek ?? 1),
        timeOfDay: schedule.data.timeOfDay,
        timezone: schedule.data.timezone,
      });
    }
  }, [saveSchedule.isPending, schedule.data, setScheduleForm]);

  const scheduleSummary = schedule.data
    ? describeSchedule(schedule.data)
    : 'Sin programación configurada';

  const openComparison = (fromId: string, toId: string) => {
    setComparisonPair({ fromId, toId });
    setCompareModalOpen(true);
  };

  return (
    <>
      <section className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Dominio
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              {site.data?.name ?? 'Cargando...'}
            </h1>
            <div className="mt-0.5 font-mono text-sm text-slate-500">
              {site.data?.domain ?? '—'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => runAudit.mutate()}
              disabled={runAudit.isPending}
              size="sm"
            >
              <Play size={14} />
              {runAudit.isPending ? 'Ejecutando...' : 'Ejecutar auditoría'}
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KpiPill
            icon={<Gauge size={14} />}
            label="Score actual"
            value={
              latestAudit?.score !== null && latestAudit?.score !== undefined
                ? `${latestAudit.score}`
                : '--'
            }
            suffix={latestAudit?.score !== null && latestAudit?.score !== undefined ? '/100' : ''}
            tone={scoreTone(latestAudit?.score ?? null)}
          />
          <KpiPill
            icon={<Workflow size={14} />}
            label="Estado"
            value={statusLabel(latestAudit?.status ?? null)}
          />
          <KpiPill
            icon={<AlertTriangle size={14} />}
            label="Críticas"
            value={String(latestAudit?.criticalIssuesCount ?? 0)}
            tone={(latestAudit?.criticalIssuesCount ?? 0) > 0 ? 'text-rose-600' : 'text-slate-700'}
          />
          <KpiPill
            icon={<TrendingDown size={14} />}
            label="Regresiones"
            value={String(latestComparison?.regressionsCount ?? 0)}
            tone={
              (latestComparison?.regressionsCount ?? 0) > 0 ? 'text-amber-600' : 'text-slate-700'
            }
          />
        </div>

        {trends.data && trends.data.points.length > 1 ? (
          <TrendsPanel points={trends.data.points} onCompare={openComparison} />
        ) : null}

        <CompareAuditsPanel
          audits={completedAudits.data?.items ?? []}
          loading={completedAudits.isLoading}
          onCompare={openComparison}
        />

        {/* Main grid */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* History (left) */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Historial</h2>
                <p className="text-xs text-slate-500">
                  Últimas auditorías ejecutadas en este dominio.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SelectInput
                  value={auditStatusFilter}
                  onValueChange={setAuditStatusFilter}
                  placeholder="Estado"
                  triggerClassName="min-w-36 py-1.5 text-xs"
                  options={[
                    { value: '', label: 'Todos' },
                    { value: 'COMPLETED', label: 'Completado' },
                    { value: 'RUNNING', label: 'Ejecutando' },
                    { value: 'FAILED', label: 'Error' },
                    { value: 'QUEUED', label: 'En cola' },
                  ]}
                />
                <SelectInput
                  value={auditTriggerFilter}
                  onValueChange={setAuditTriggerFilter}
                  placeholder="Disparador"
                  triggerClassName="min-w-36 py-1.5 text-xs"
                  options={[
                    { value: '', label: 'Todos' },
                    { value: 'MANUAL', label: 'Manual' },
                    { value: 'SCHEDULED', label: 'Programada' },
                    { value: 'WEBHOOK', label: 'Webhook' },
                  ]}
                />
              </div>
            </div>

            <ul className="mt-4 divide-y divide-slate-100">
              {audits.isLoading
                ? ['a1', 'a2', 'a3'].map((slot) => (
                    <li key={slot} className="py-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                    </li>
                  ))
                : null}
              {!audits.isLoading && auditItems.length === 0 ? (
                <li className="py-8 text-center text-sm text-slate-500">
                  Todavía no se ha ejecutado ninguna auditoría.
                </li>
              ) : null}
              {auditItems.map((audit, index) => {
                const previousAudit = auditItems[index + 1] ?? null;
                return (
                  <li key={audit.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className={`inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ${scoreBg(audit.score)}`}
                      >
                        <span className={`text-sm font-bold ${scoreTone(audit.score)}`}>
                          {audit.score ?? '--'}
                        </span>
                        <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                          score
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone(audit.status)}`}
                          >
                            {statusLabel(audit.status)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {triggerLabel(audit.trigger)}
                          </span>
                          {audit.criticalIssuesCount > 0 ? (
                            <span className="text-xs font-medium text-rose-600">
                              {audit.criticalIssuesCount} críticas
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {formatDisplayDateTime(audit.createdAt)} · #{audit.id.slice(0, 8)} ·{' '}
                          {audit.issuesCount} hallazgos
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-slate-500">
                        {previousAudit ? (
                          <button
                            type="button"
                            onClick={() => openComparison(previousAudit.id, audit.id)}
                            title="Comparar con la anterior"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <ArrowRight size={12} aria-hidden="true" />
                            Comparar
                          </button>
                        ) : null}
                        <Link
                          to="/sites/$id/audits/$auditId"
                          params={{ id, auditId: audit.id }}
                          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition hover:bg-slate-100 hover:text-slate-900"
                          title="Ver detalle"
                        >
                          Detalle
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            createExport.mutate({ kind: 'ISSUES', auditRunId: audit.id })
                          }
                          title="Descargar CSV de incidencias"
                          className="inline-flex items-center justify-center rounded-md p-1.5 transition hover:bg-slate-100 hover:text-slate-900"
                        >
                          <FileDown size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Sidebar (settings) */}
          <aside className="space-y-4">
            <ScheduleCard
              summary={scheduleSummary}
              onEdit={() => setScheduleModalOpen(true)}
              loading={schedule.isLoading}
            />

            {site.data ? (
              <PublicBadgeCard siteId={site.data.id} projectId={site.data.projectId} />
            ) : null}

            <AlertsCard
              alertState={alertState}
              setAlertState={setAlertState}
              onSave={() => saveAlerts.mutate()}
              saving={saveAlerts.isPending}
              loading={alerts.isLoading}
            />

            <ExportsCard
              latestAudit={latestAudit}
              latestComparison={latestComparison}
              exports={exportsQuery.data?.items ?? []}
              onCreateExport={(payload) => createExport.mutate(payload)}
              onDownload={(exp) => void downloadExport(auth, exp.id, exp.fileName)}
            />
          </aside>
        </div>

        {/* Comparisons — collapsible extra */}
        {(comparisons.data?.items?.length ?? 0) > 0 ? (
          <ComparisonsSection items={comparisons.data?.items ?? []} onOpen={openComparison} />
        ) : null}
      </section>

      {/* Schedule modal */}
      <Modal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        title="Programación"
        description="Define cuándo se ejecutará la auditoría automática para este dominio."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              id="schedule-frequency"
              label="Frecuencia"
              value={scheduleForm.frequency}
              onValueChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  frequency: value as 'DAILY' | 'WEEKLY',
                }))
              }
              options={[
                { value: 'DAILY', label: 'Diaria' },
                { value: 'WEEKLY', label: 'Semanal' },
              ]}
            />
            {scheduleForm.frequency === 'WEEKLY' ? (
              <SelectInput
                id="schedule-day"
                label="Día de la semana"
                value={scheduleForm.dayOfWeek}
                onValueChange={(value) =>
                  setScheduleForm((current) => ({ ...current, dayOfWeek: value }))
                }
                options={DAY_LABELS.map((label, index) => ({
                  value: String(index),
                  label,
                }))}
              />
            ) : null}
            <div>
              <label
                htmlFor="schedule-time"
                className="mb-1 block text-xs font-semibold text-slate-600"
              >
                Hora
              </label>
              <TextInput
                id="schedule-time"
                type="time"
                value={scheduleForm.timeOfDay}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    timeOfDay: event.target.value,
                  }))
                }
              />
            </div>
            <div className={scheduleForm.frequency === 'WEEKLY' ? 'sm:col-span-2' : ''}>
              <SelectInput
                id="schedule-timezone"
                label="Zona horaria"
                value={scheduleForm.timezone}
                onValueChange={(value) =>
                  setScheduleForm((current) => ({ ...current, timezone: value }))
                }
                options={timezoneOptions}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setScheduleModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveSchedule.mutate()}
              disabled={saveSchedule.isPending}
            >
              <Save size={14} />
              {saveSchedule.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Comparison modal */}
      <Modal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        title="Comparativa"
        description="Diferencias entre dos ejecuciones del mismo dominio."
      >
        {comparison.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : comparison.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {comparison.error instanceof Error
              ? comparison.error.message
              : 'No se pudo cargar la comparativa.'}
          </div>
        ) : comparison.data ? (
          <ComparisonDetailView data={comparison.data} />
        ) : (
          <p className="text-sm text-slate-500">Selecciona una comparativa para ver sus cambios.</p>
        )}
      </Modal>
    </>
  );
}

/* ---------------- Sub-components ---------------- */

function KpiPill({
  icon,
  label,
  value,
  suffix,
  tone = 'text-slate-900',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {suffix ? <span className="ml-0.5 text-xs text-slate-400">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ScheduleCard({
  summary,
  onEdit,
  loading,
}: {
  summary: string;
  onEdit: () => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 size={14} className="text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">Programación</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <Pencil size={12} aria-hidden="true" />
          Editar
        </button>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">
        {loading ? <Skeleton className="h-4 w-3/4" /> : summary}
      </p>
    </section>
  );
}

function AlertsCard({
  alertState,
  setAlertState,
  onSave,
  saving,
  loading,
}: {
  alertState: AlertRule;
  setAlertState: React.Dispatch<React.SetStateAction<AlertRule>>;
  onSave: () => void;
  saving: boolean;
  loading: boolean;
}) {
  const disabled = !alertState.enabled;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Settings2 size={14} className="text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Alertas de regresión</h3>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Recibe avisos cuando algo empeore entre auditorías.
      </p>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <ToggleRow
            label="Alertas activas"
            checked={alertState.enabled}
            onChange={(checked) => setAlertState((current) => ({ ...current, enabled: checked }))}
          />
          <div className={`space-y-2.5 ${disabled ? 'opacity-50' : ''}`}>
            <ToggleRow
              label="Caída de score"
              hint={`Si baja ≥ ${alertState.scoreDropThreshold} puntos`}
              checked={alertState.notifyOnScoreDrop}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({ ...current, notifyOnScoreDrop: checked }))
              }
            />
            {alertState.notifyOnScoreDrop ? (
              <div className="ml-1 flex items-center gap-2 text-xs text-slate-600">
                <span>Umbral:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={disabled}
                  value={alertState.scoreDropThreshold}
                  onChange={(event) =>
                    setAlertState((current) => ({
                      ...current,
                      scoreDropThreshold: Number(event.target.value) || 1,
                    }))
                  }
                  className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none transition focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-200"
                />
                <span>puntos</span>
              </div>
            ) : null}
            <ToggleRow
              label="Nuevas incidencias críticas"
              checked={alertState.notifyOnNewCriticalIssues}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({ ...current, notifyOnNewCriticalIssues: checked }))
              }
            />
            <ToggleRow
              label="Aumento de incidencias totales"
              checked={alertState.notifyOnIssueCountIncrease}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({
                  ...current,
                  notifyOnIssueCountIncrease: checked,
                }))
              }
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </section>
  );
}

function ExportsCard({
  latestAudit,
  latestComparison,
  exports,
  onCreateExport,
  onDownload,
}: {
  latestAudit: AuditRun | null;
  latestComparison: ComparisonItem | null;
  exports: ProjectExport[];
  onCreateExport: (payload: { kind: string; auditRunId?: string; comparisonId?: string }) => void;
  onDownload: (exp: ProjectExport) => void;
}) {
  const [open, setOpen] = useState(false);
  const recent = exports.slice(0, 3);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Download size={14} className="text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Exportaciones</h3>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCreateExport({ kind: 'HISTORY' })}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <FileDown size={12} />
          Histórico
        </button>
        {latestAudit ? (
          <button
            type="button"
            onClick={() => onCreateExport({ kind: 'METRICS', auditRunId: latestAudit.id })}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <FileDown size={12} />
            Métricas
          </button>
        ) : null}
        {latestComparison ? (
          <button
            type="button"
            onClick={() =>
              onCreateExport({ kind: 'COMPARISON', comparisonId: latestComparison.id })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <FileDown size={12} />
            Comparativa
          </button>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <span>
              {exports.length} exportaci{exports.length === 1 ? 'ón' : 'ones'} generada
              {exports.length === 1 ? '' : 's'}
            </span>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {open ? (
            <ul className="mt-2 space-y-1.5">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {item.kind} · {item.format}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {formatDisplayDateTime(item.createdAt)}
                    </div>
                  </div>
                  {item.status === 'COMPLETED' ? (
                    <button
                      type="button"
                      onClick={() => onDownload(item)}
                      className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      Descargar
                    </button>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {item.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ComparisonsSection({
  items,
  onOpen,
}: {
  items: ComparisonItem[];
  onOpen: (fromId: string, toId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="text-left">
          <h2 className="text-sm font-semibold text-slate-900">
            Comparativas guardadas{' '}
            <span className="font-normal text-slate-500">({items.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Pares de auditorías archivados para consultar cambios en el tiempo.
          </p>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-slate-500" />
        ) : (
          <ChevronRight size={14} className="text-slate-500" />
        )}
      </button>
      {open ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const up = item.scoreDelta >= 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.baselineAuditRunId, item.targetAuditRunId)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {up ? '+' : ''}
                      {item.scoreDelta} pts
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      {item.regressionsCount} reg.
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.baselineRun?.createdAt
                      ? formatDisplayDate(item.baselineRun.createdAt)
                      : '--'}{' '}
                    →{' '}
                    {item.targetRun?.createdAt ? formatDisplayDate(item.targetRun.createdAt) : '--'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function ComparisonDetailView({ data }: { data: ComparisonDetail }) {
  const up = data.delta.score >= 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Anterior" value={String(data.from.run.score ?? '--')} />
        <MiniStat label="Actual" value={String(data.to.run.score ?? '--')} />
        <MiniStat
          label="Δ Score"
          value={`${up ? '+' : ''}${data.delta.score}`}
          tone={up ? 'text-emerald-600' : 'text-rose-600'}
        />
        <MiniStat
          label="Δ Incidencias"
          value={`${data.delta.issues >= 0 ? '+' : ''}${data.delta.issues}`}
          tone={data.delta.issues >= 0 ? 'text-rose-600' : 'text-emerald-600'}
        />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Cambios detectados
        </div>
        <ul className="mt-2 space-y-1.5">
          {data.changes.length === 0 ? (
            <li className="text-sm text-slate-500">Sin cambios persistidos.</li>
          ) : null}
          {data.changes.map((change) => (
            <li
              key={
                change.id ??
                `${change.changeType}-${change.title}-${change.severity ?? 'none'}-${change.delta ?? 'none'}`
              }
              className="rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="text-sm font-medium text-slate-800">{change.title}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">
                {change.changeType}
                {change.severity ? ` · ${change.severity}` : ''}
                {typeof change.delta === 'number'
                  ? ` · ${change.delta > 0 ? '+' : ''}${change.delta}`
                  : ''}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-slate-700">{label}</span>
        {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-brand-500"
      />
    </label>
  );
}

/* ---------------- helpers ---------------- */

function describeSchedule(schedule: Schedule): string {
  const time = schedule.timeOfDay;
  const tz = schedule.timezone;
  if (schedule.frequency === 'DAILY') {
    return `Diaria a las ${time} · ${tz}`;
  }
  const day = DAY_LABELS[(schedule.dayOfWeek ?? 1) % 7] ?? 'Lunes';
  return `Los ${day.toLowerCase()} a las ${time} · ${tz}`;
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

function scoreBg(score: number | null) {
  if (score === null) return 'bg-slate-100';
  if (score >= 85) return 'bg-emerald-50';
  if (score >= 65) return 'bg-amber-50';
  return 'bg-rose-50';
}

function triggerLabel(trigger: AuditRun['trigger']) {
  if (trigger === 'MANUAL') return 'Manual';
  if (trigger === 'SCHEDULED') return 'Programada';
  return 'Webhook';
}

async function downloadExport(
  auth: ReturnType<typeof useAuth>,
  exportId: string,
  fileName: string | null,
) {
  const blob = await auth.api.getBlob(`/exports/${exportId}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName ?? `export-${exportId}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
