import { BellOff, RotateCcw } from 'lucide-react';

import { Modal } from '../modal';
import { CATEGORY_LABELS, getIssueCodeInfo } from '../../lib/issue-codes';
import { formatRelative } from './audit-detail-formatters';
import type { IssueGroup, IssueState } from './audit-detail-types';
import { SeverityChip } from './badges';

type Props = {
  group: IssueGroup | null;
  onClose: () => void;
  onChangeState: (projectIssueId: string, state: IssueState) => void;
  onBulkChangeState: (projectIssueIds: string[], state: IssueState) => void;
  isPending: boolean;
};

/**
 * Modal drawer that shows everything about a single issue *type* (an
 * IssueGroup): what it is, how to fix it, when it was first/last seen and
 * every individual occurrence with its own ignore/restore action.
 *
 * Receives intent callbacks instead of mutations so the route file owns the
 * data layer (toasts, query invalidation) and the drawer stays a pure view.
 */
export function IssueDetailDrawer({
  group,
  onClose,
  onChangeState,
  onBulkChangeState,
  isPending,
}: Props) {
  const info = group ? getIssueCodeInfo(group.code) : null;
  return (
    <Modal
      open={Boolean(group)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={info?.title ?? 'Incidencia'}
      description={info?.description}
    >
      {group && info ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <SeverityChip severity={group.severity} />
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
              {CATEGORY_LABELS[group.category] ?? group.category}
            </span>
            <span className="font-mono tracking-tight text-slate-400">{group.code}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {group.items.length} {group.items.length === 1 ? 'ocurrencia' : 'ocurrencias'}
            </span>
          </div>
          {group.firstSeenAt || group.lastSeenAt ? (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
              {group.firstSeenAt ? (
                <div>
                  <div className="font-semibold uppercase tracking-wider text-slate-500">
                    Primera vez
                  </div>
                  <div className="mt-0.5 text-slate-700">{formatRelative(group.firstSeenAt)}</div>
                </div>
              ) : null}
              {group.lastSeenAt ? (
                <div>
                  <div className="font-semibold uppercase tracking-wider text-slate-500">
                    Vista por última vez
                  </div>
                  <div className="mt-0.5 text-slate-700">{formatRelative(group.lastSeenAt)}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Cómo solucionarlo
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{info.howToFix}</p>
          </section>
          <OccurrencesSection
            group={group}
            onChangeState={onChangeState}
            onBulkChangeState={onBulkChangeState}
            isPending={isPending}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function OccurrencesSection({
  group,
  onChangeState,
  onBulkChangeState,
  isPending,
}: {
  group: IssueGroup;
  onChangeState: (projectIssueId: string, state: IssueState) => void;
  onBulkChangeState: (projectIssueIds: string[], state: IssueState) => void;
  isPending: boolean;
}) {
  const ignorableIds = group.items
    .filter((i) => i.projectIssueId && i.state !== 'IGNORED')
    .map((i) => i.projectIssueId!);
  const restorableIds = group.items
    .filter((i) => i.projectIssueId && i.state === 'IGNORED')
    .map((i) => i.projectIssueId!);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Ocurrencias
        </h3>
        <div className="flex items-center gap-2">
          {ignorableIds.length > 1 ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onBulkChangeState(ignorableIds, 'IGNORED')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
            >
              <BellOff size={11} aria-hidden="true" />
              Ignorar todas ({ignorableIds.length})
            </button>
          ) : null}
          {restorableIds.length > 1 ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onBulkChangeState(restorableIds, 'OPEN')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
            >
              <RotateCcw size={11} aria-hidden="true" />
              Reactivar todas ({restorableIds.length})
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Ignora un tipo para que no afecte al score en auditorías futuras.
      </p>
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {group.items.map((issue) => {
          const isIgnored = issue.state === 'IGNORED';
          return (
            <li
              key={issue.id}
              className={`rounded-lg border px-3 py-2 ${
                isIgnored
                  ? 'border-slate-200 bg-slate-100/70 opacity-80'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm leading-6 text-slate-800">{issue.message}</p>
                {issue.projectIssueId ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      onChangeState(issue.projectIssueId!, isIgnored ? 'OPEN' : 'IGNORED')
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
                  >
                    {isIgnored ? (
                      <>
                        <RotateCcw size={11} aria-hidden="true" /> Reactivar
                      </>
                    ) : (
                      <>
                        <BellOff size={11} aria-hidden="true" /> Ignorar
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {issue.resourceUrl ? (
                <p className="mt-1 truncate font-mono text-xs text-slate-500">
                  {issue.resourceUrl}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
