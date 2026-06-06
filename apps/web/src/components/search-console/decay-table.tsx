import { Download, TrendingDown } from 'lucide-react';

import { Badge } from '#/components/badge';

import { formatNumber, formatPercent } from './format';
import type { DecayRow } from './types';

/**
 * Content decay table: pages losing clicks between the previous and recent halves of the range.
 * Rendered below the top URLs so page health lives in one place.
 */
export function DecayTable({ rows, onExport }: { rows: DecayRow[]; onExport?: () => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          <TrendingDown size={14} className="text-rose-500" aria-hidden="true" />
          Páginas en declive
        </h3>
        {onExport && rows.length > 0 ? (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <Download size={12} aria-hidden="true" />
            CSV
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          Ninguna página pierde clics frente a la primera mitad del periodo.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-2.5">URL</th>
                <th className="px-4 py-2.5 text-right">Antes</th>
                <th className="px-4 py-2.5 text-right">Ahora</th>
                <th className="px-4 py-2.5 text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.value} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700" title={row.value}>
                    <span className="block max-w-[24rem] truncate font-medium">{row.value}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatNumber(row.previousClicks)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {formatNumber(row.recentClicks)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge tone="danger">{formatPercent(row.changeRatio)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
