import { Clipboard, Download, ShieldAlert } from 'lucide-react';

import { Button } from '#/components/button';
import { Skeleton } from '#/components/skeleton';

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

type ActionItem = SeoActionPlanPayload['actions'][number];

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
                {action.regressionCount}{' '}
                {action.regressionCount === 1 ? 'regresión' : 'regresiones'}
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
