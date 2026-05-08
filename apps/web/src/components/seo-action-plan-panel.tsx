import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  Gauge,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '#/components/button';
import { Skeleton } from '#/components/skeleton';
import { formatNumericDate } from '#/lib/date-format';

type ActionStatus = 'OPEN' | 'IGNORED' | 'FIXED';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ActionLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SeoActionPlanPayload {
  site: {
    id: string;
    name: string;
    domain: string;
  };
  audit: {
    id: string;
    status: string;
    score: number | null;
    previousScore: number | null;
    scoreDelta: number | null;
    createdAt: string;
    finishedAt: string | null;
  };
  executiveSummary: {
    score: number | null;
    scoreDelta: number | null;
    criticalOpenActions: number;
    topRisk: string | null;
    improvementsDetected: number;
    nextBestAction: string | null;
    copyText: string;
  };
  totals: {
    actions: number;
    open: number;
    ignored: number;
    fixed: number;
    affectedPages: number;
    regressions: number;
  };
  actions: Array<{
    id: string;
    issueCode: string;
    title: string;
    category: string;
    categoryLabel: string;
    severity: Severity;
    status: ActionStatus;
    priority: number;
    impact: ActionLevel;
    effort: ActionLevel;
    estimatedImpactPoints: number;
    scoreImpactPoints: number;
    occurrences: number;
    affectedPagesCount: number;
    affectedPages: string[];
    evidenceSummary: string;
    priorityReason: string;
    regressionCount: number;
    recommendedAction: string;
    remediationPrompt: string;
  }>;
}

interface PanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
}

interface SeoActionPanelProps {
  plan?: SeoActionPlanPayload | null;
  loading?: boolean;
  exportAction?: PanelAction;
}

interface MetricItem {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string | null;
}

type ActionItem = SeoActionPlanPayload['actions'][number];

export function SiteNextActionsPanel({ plan, loading, exportAction }: SeoActionPanelProps) {
  if (loading) {
    return <ActionPanelSkeleton />;
  }

  if (!plan) {
    return <ActionPanelEmpty />;
  }

  const topActions = plan.actions.slice(0, 5);
  const { scoreDelta } = plan.executiveSummary;
  const sourceLabel = formatAuditSource(
    plan.audit.finishedAt ?? plan.audit.createdAt,
    plan.audit.id,
  );

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <PanelHeader
        badgeClassName="bg-emerald-50 text-emerald-700"
        badgeIcon={<Zap size={12} aria-hidden="true" />}
        badgeLabel="Operativo"
        description="Prioridades accionables para decidir qué corregir ahora en este dominio."
        exportAction={exportAction}
        metrics={[
          {
            detail:
              scoreDelta !== null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta} pts` : sourceLabel,
            icon: <Gauge size={14} aria-hidden="true" />,
            label: 'Score actual',
            value: plan.audit.score !== null ? `${plan.audit.score}/100` : 'N/D',
          },
          {
            detail: `${plan.executiveSummary.criticalOpenActions} críticas`,
            icon: <ShieldAlert size={14} aria-hidden="true" />,
            label: 'Acciones abiertas',
            value: String(plan.totals.open),
          },
          {
            detail: `${plan.executiveSummary.improvementsDetected} mejoras recientes`,
            icon: <AlertTriangle size={14} aria-hidden="true" />,
            label: 'Regresiones',
            value: String(plan.totals.regressions),
          },
          {
            detail: `${plan.totals.fixed} resueltas`,
            icon: <CheckCircle2 size={14} aria-hidden="true" />,
            label: 'URLs afectadas',
            value: String(plan.totals.affectedPages),
          },
        ]}
        title="Próximas acciones del dominio"
      />

      <section className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              Qué corregir ahora
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{sourceLabel}</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {plan.actions.length} acciones priorizadas
          </span>
        </div>

        {topActions.length === 0 ? (
          <EmptyPanelMessage text="Sin acciones abiertas en la última auditoría del dominio." />
        ) : (
          <ol className="mt-4 space-y-3">
            {topActions.map((action, index) => (
              <DomainActionItem action={action} index={index} key={action.id} />
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

export function AuditKeyFindingsPanel({ plan, loading, exportAction }: SeoActionPanelProps) {
  if (loading) {
    return <CompactActionPanelSkeleton />;
  }

  if (!plan) {
    return null;
  }

  const findings = plan.actions.slice(0, 3);
  const highestSeverity = getHighestSeverity(plan.actions);
  const occurrences = plan.actions.reduce((total, action) => total + action.occurrences, 0);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
            <ShieldAlert size={11} aria-hidden="true" />
            Plan
          </div>
          <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950">
            Plan de solución
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Prioridades resumidas. El detalle completo está en incidencias técnicas.
          </p>
        </div>

        {exportAction ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={exportAction.onClick}
            disabled={exportAction.disabled}
          >
            <Download size={14} />
            {exportAction.pending ? 'Exportando...' : exportAction.label}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
        <CompactMetric
          label="Riesgo"
          value={highestSeverity ? severityLabel(highestSeverity) : 'Sin riesgo'}
        />
        <CompactMetric label="Abiertas" value={String(plan.totals.open)} />
        <CompactMetric label="Ocurrencias" value={String(occurrences)} />
        <CompactMetric label="URLs" value={String(plan.totals.affectedPages)} />
      </div>

      {findings.length === 0 ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          Esta auditoría no registra acciones abiertas.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {findings.map((action, index) => (
            <AuditFindingItem action={action} index={index} key={action.id} />
          ))}
        </ol>
      )}
    </article>
  );
}

function PanelHeader({
  badgeClassName,
  badgeIcon,
  badgeLabel,
  description,
  exportAction,
  metrics,
  title,
}: {
  badgeClassName: string;
  badgeIcon: ReactNode;
  badgeLabel: string;
  description: string;
  exportAction?: PanelAction;
  metrics: MetricItem[];
  title: string;
}) {
  return (
    <div className="border-b border-slate-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${badgeClassName}`}
          >
            {badgeIcon}
            {badgeLabel}
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>

        {exportAction ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={exportAction.onClick}
            disabled={exportAction.disabled}
          >
            <Download size={14} />
            {exportAction.pending ? 'Exportando...' : exportAction.label}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <PlanMetric
            detail={metric.detail}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>
    </div>
  );
}

function DomainActionItem({ action, index }: { action: ActionItem; index: number }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <ActionMeta action={action} index={index} />
          <h4 className="mt-3 text-base font-bold text-slate-950">{action.title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">{action.recommendedAction}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 text-right text-xs">
          <MiniStat label="Impacto" value={actionLevelLabel(action.impact)} />
          <MiniStat label="Esfuerzo" value={actionLevelLabel(action.effort)} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
          {action.categoryLabel}
        </span>
        <span>{action.occurrences} ocurrencias</span>
        <span>{action.affectedPagesCount} páginas</span>
        <span>{action.scoreImpactPoints ?? action.estimatedImpactPoints} pts de score</span>
        <CopyPromptButton prompt={action.remediationPrompt} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        <span className="font-bold text-slate-800">Evidencia:</span> {action.evidenceSummary}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{action.priorityReason}</p>

      <AffectedPages pages={action.affectedPages} />
    </li>
  );
}

function AuditFindingItem({ action, index }: { action: ActionItem; index: number }) {
  return (
    <li className="bg-white px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
              {index + 1}
            </span>
            <SeverityPill severity={action.severity} />
            {action.regressionCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                Regresión
              </span>
            ) : null}
          </div>
          <h4 className="mt-1.5 text-sm font-bold leading-5 text-slate-950">{action.title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {action.affectedPagesCount} {action.affectedPagesCount === 1 ? 'URL' : 'URLs'} ·{' '}
            {action.occurrences} {action.occurrences === 1 ? 'ocurrencia' : 'ocurrencias'} ·{' '}
            {actionLevelLabel(action.impact)}/{actionLevelLabel(action.effort)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
            {action.evidenceSummary}
          </p>
        </div>
        <CopyPromptButton prompt={action.remediationPrompt} />
      </div>
    </li>
  );
}

function CopyPromptButton({ prompt }: { prompt: string }) {
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(prompt)}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      title="Copiar prompt de solución"
    >
      <Clipboard size={12} aria-hidden="true" />
      Copiar prompt
    </button>
  );
}

function ActionMeta({ action, index }: { action: ActionItem; index: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
        {index + 1}
      </span>
      <SeverityPill severity={action.severity} />
      <StatusPill status={action.status} />
      {action.regressionCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          Regresión
        </span>
      ) : null}
    </div>
  );
}

function AffectedPages({ pages }: { pages: string[] }) {
  if (pages.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {pages.map((page) => (
        <span
          key={page}
          className="max-w-full truncate rounded-md bg-white px-2 py-1 font-mono text-[11px] text-slate-500"
        >
          {page}
        </span>
      ))}
    </div>
  );
}

function EmptyPanelMessage({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
      {text}
    </div>
  );
}

function ActionPanelSkeleton() {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-48" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="mt-4 h-28 w-full" />
    </article>
  );
}

function ActionPanelEmpty() {
  return (
    <article className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center shadow-sm">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
        <Zap size={18} aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-bold text-slate-900">Sin plan de acción todavía</h3>
      <p className="mt-1 text-xs text-slate-600">
        Lanza una auditoría para generar prioridades accionables sobre este dominio.
      </p>
    </article>
  );
}

function PlanMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-black text-slate-950">{value}</span>
        {detail ? <span className="text-xs font-semibold text-slate-500">{detail}</span> : null}
      </div>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-black text-slate-800">{value}</span>
    </span>
  );
}

function CompactActionPanelSkeleton() {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="mt-3 h-5 w-44" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
      </div>
    </article>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone =
    severity === 'CRITICAL'
      ? 'bg-rose-100 text-rose-800'
      : severity === 'HIGH'
        ? 'bg-orange-100 text-orange-800'
        : severity === 'MEDIUM'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {severityLabel(severity)}
    </span>
  );
}

function StatusPill({ status }: { status: ActionStatus }) {
  const label = status === 'OPEN' ? 'Abierta' : status === 'IGNORED' ? 'Ignorada' : 'Resuelta';
  const tone =
    status === 'OPEN'
      ? 'bg-sky-100 text-sky-800'
      : status === 'IGNORED'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-emerald-100 text-emerald-800';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2.5 py-2">
      <div className="font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-0.5 max-w-28 truncate font-black text-slate-900">{value}</div>
    </div>
  );
}

function getHighestSeverity(actions: ActionItem[]) {
  const severityRank: Record<Severity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    LOW: 1,
    MEDIUM: 2,
  };
  const highest = actions.reduce<Severity | null>((current, action) => {
    if (!current || severityRank[action.severity] > severityRank[current]) {
      return action.severity;
    }
    return current;
  }, null);
  return highest;
}

function severityLabel(severity: Severity) {
  if (severity === 'CRITICAL') {
    return 'Crítica';
  }
  if (severity === 'HIGH') {
    return 'Alta';
  }
  if (severity === 'MEDIUM') {
    return 'Media';
  }
  return 'Baja';
}

function actionLevelLabel(level: ActionLevel) {
  if (level === 'HIGH') return 'Alto';
  if (level === 'MEDIUM') return 'Medio';
  return 'Bajo';
}

function formatAuditSource(value: string, auditId: string) {
  const formatted = formatNumericDate(value);
  if (!formatted) {
    return `Fuente: auditoría #${auditId.slice(0, 8)}`;
  }
  return `Fuente: auditoría del ${formatted} · #${auditId.slice(0, 8)}`;
}
