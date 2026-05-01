import { BellOff, ChevronDown } from 'lucide-react';

import { CATEGORY_LABELS, getIssueCodeInfo } from '../../lib/issue-codes';
import { formatRelative } from './audit-detail-formatters';
import type { IssueGroup } from './audit-detail-types';

export function IssueGroupCard({ group, onOpen }: { group: IssueGroup; onOpen: () => void }) {
  const info = getIssueCodeInfo(group.code);
  const count = group.items.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group/issue flex w-full items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        group.allIgnored
          ? 'border-slate-200 bg-slate-50/60 opacity-70'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
            {CATEGORY_LABELS[group.category] ?? group.category}
          </span>
          <span className="font-mono tracking-tight text-slate-400">{group.code}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            ×{count}
          </span>
          {group.allIgnored ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              <BellOff size={10} aria-hidden="true" /> Ignorado
            </span>
          ) : group.anyIgnored ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              <BellOff size={10} aria-hidden="true" /> Parcialmente ignorado
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{info.title}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{info.description}</p>
        {group.firstSeenAt ? (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Detectado por primera vez{' '}
            <span className="font-semibold text-slate-700">
              {formatRelative(group.firstSeenAt)}
            </span>
          </p>
        ) : null}
      </div>
      <ChevronDown
        size={16}
        className="mt-1 shrink-0 -rotate-90 text-slate-400 transition group-hover/issue:text-slate-600"
        aria-hidden="true"
      />
    </button>
  );
}
