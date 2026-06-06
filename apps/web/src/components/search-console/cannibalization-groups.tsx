import { ChevronDown, Layers } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '#/components/badge';
import { EmptyState } from '#/components/empty-state';

import { formatNumber, formatPercent, formatPosition } from './format';
import type { CannibalizationGroup } from './types';

/**
 * Keyword cannibalization groups: one query competed for by 2+ of the site's URLs. Each group is
 * collapsible and lists the competing pages with their metrics so the user can decide which URL to
 * consolidate around.
 */
export function CannibalizationGroups({ groups }: { groups: CannibalizationGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={20} aria-hidden="true" />}
        title="Sin canibalización detectada"
        description="No hay consultas con varias URLs compitiendo en el periodo. Importa el rango query+página o amplía las fechas si esperabas resultados."
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <CannibalizationCard key={group.query} group={group} />
      ))}
    </div>
  );
}

function CannibalizationCard({ group }: { group: CannibalizationGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-bold text-slate-900" title={group.query}>
            {group.query}
          </span>
          <Badge tone="warning">{group.pages.length} URLs</Badge>
          <Badge tone="neutral">{Math.round((1 - group.dominantShare) * 100)}% repartido</Badge>
        </span>
        <span className="shrink-0 text-xs font-semibold text-slate-500">
          {formatNumber(group.clicks)} clicks · {formatNumber(group.impressions)} impr.
        </span>
      </button>
      {open ? (
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-2.5">URL</th>
                <th className="px-4 py-2.5 text-right">Posición</th>
                <th className="px-4 py-2.5 text-right">Impresiones</th>
                <th className="px-4 py-2.5 text-right">CTR</th>
                <th className="px-4 py-2.5 text-right">Clics</th>
              </tr>
            </thead>
            <tbody>
              {group.pages.map((page) => (
                <tr key={page.page} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700" title={page.page}>
                    <span className="block max-w-[22rem] truncate font-medium">{page.page}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatPosition(page.position)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatNumber(page.impressions)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatPercent(page.ctr)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatNumber(page.clicks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
