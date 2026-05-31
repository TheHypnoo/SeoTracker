import { AlertTriangle, CheckCircle2, Clock, Gauge, Loader2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { SEVERITY_INFO } from '../../lib/issue-codes';
import { httpStatusPillTone, scoreTone, severityStyle } from './audit-detail-formatters';
import type { Severity } from './audit-detail-types';

type InlineStatTone = 'neutral' | 'warning' | 'danger' | 'success';

const STATUS_BADGE_MAP: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  COMPLETED: {
    label: 'Completada',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  RUNNING: {
    label: 'En curso',
    cls: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: <Loader2 size={12} className="animate-spin" aria-hidden="true" />,
  },
  QUEUED: {
    label: 'En cola',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  FAILED: {
    label: 'Falló',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <XCircle size={12} aria-hidden="true" />,
  },
};

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  SCHEDULED: 'Programada',
  WEBHOOK: 'Webhook',
};

const INLINE_STAT_TONE_CLASS: Record<InlineStatTone, string> = {
  neutral: 'text-slate-900',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
  success: 'text-emerald-600',
};

export function StatusBadge({ status }: { status: string }) {
  const item = STATUS_BADGE_MAP[status] ?? {
    label: status,
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: <AlertTriangle size={12} aria-hidden="true" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${item.cls}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

export function TriggerBadge({ trigger }: { trigger: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
      {TRIGGER_LABELS[trigger] ?? trigger}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const tone = severityStyle(severity);
  const info = SEVERITY_INFO[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.chip}`}
      title={info.tooltip}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {info.label}
    </span>
  );
}

export function InlineStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: InlineStatTone;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${INLINE_STAT_TONE_CLASS[tone]}`}>
        {value}
      </div>
    </div>
  );
}

export function PageScorePill({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
        <Gauge size={10} aria-hidden="true" />
        --
      </span>
    );
  }
  const tone = scoreTone(score);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone.border} ${tone.bg} ${tone.text}`}
      title="Score estimado de la página"
    >
      <Gauge size={10} aria-hidden="true" />
      {score}
    </span>
  );
}

export function HttpStatusPill({ status }: { status: number | null }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${httpStatusPillTone(status)}`}
    >
      {status ?? '--'}
    </span>
  );
}
