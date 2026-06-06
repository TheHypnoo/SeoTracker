import { Download, Sparkles } from 'lucide-react';

import { Badge } from '#/components/badge';
import { EmptyState } from '#/components/empty-state';

import { formatNumber, formatPercent, formatPosition } from './format';
import type { OpportunityRow } from './types';

/**
 * Striking-distance opportunities table: queries ranking on the edge of page one, sorted by the
 * extra clicks they could capture. "Clics potenciales" is an estimate, not a guarantee.
 */
export function OpportunitiesTable({
  rows,
  onExport,
}: {
  rows: OpportunityRow[];
  onExport?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={20} aria-hidden="true" />}
        title="Sin oportunidades en este periodo"
        description="Las oportunidades aparecen cuando hay consultas en posición 5–20 con impresiones suficientes. Amplía el rango o importa más datos."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {onExport ? (
        <div className="flex justify-end border-b border-slate-200 px-4 py-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <Download size={12} aria-hidden="true" />
            CSV
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              <th className="px-4 py-3">Consulta</th>
              <th className="px-4 py-3 text-right">Posición</th>
              <th className="px-4 py-3 text-right">Impresiones</th>
              <th className="px-4 py-3 text-right">CTR</th>
              <th className="px-4 py-3 text-right">Clics</th>
              <th className="px-4 py-3 text-right">Clics potenciales</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-semibold text-slate-900" title={row.value}>
                  <span className="block max-w-[20rem] truncate">{row.value}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatPosition(row.position)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatNumber(row.impressions)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatPercent(row.ctr)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatNumber(row.clicks)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Badge tone="brand">+{formatNumber(row.potentialClicks)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
