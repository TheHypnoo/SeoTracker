import { useQuery } from '@tanstack/react-query';
import { LineChart, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/button';
import { ClicksImpressionsChart } from '#/components/charts/clicks-impressions-chart';
import { EmptyState } from '#/components/empty-state';
import { TextInput } from '#/components/text-input';
import { useAuth } from '#/lib/auth-context';

import { formatNumber, formatPercent, formatPosition, rangeParams } from './format';
import type { TimeseriesPoint, TrackedKeyword } from './types';

/**
 * SeoCrawl-style keyword tracking tab: pin queries and follow their position/clicks over time.
 * Selecting a tracked keyword charts its evolution using the shared clicks/impressions chart.
 */
export function KeywordTracking({
  siteId,
  startDate,
  endDate,
  keywords,
  loading,
  trackPending,
  onTrack,
  onUntrack,
}: {
  siteId: string;
  startDate: string;
  endDate: string;
  keywords: TrackedKeyword[];
  loading: boolean;
  trackPending: boolean;
  onTrack: (query: string) => void;
  onUntrack: (query: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = draft.trim();
    if (!query) {
      return;
    }
    onTrack(query);
    setDraft('');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <TextInput
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Añade una consulta a seguir, p. ej. zapatillas running"
            aria-label="Consulta a seguir"
          />
        </div>
        <Button type="submit" loading={trackPending} disabled={!draft.trim()}>
          <Plus size={14} aria-hidden="true" />
          Seguir
        </Button>
      </form>

      {loading ? (
        <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-100" />
      ) : keywords.length === 0 ? (
        <EmptyState
          icon={<Star size={20} aria-hidden="true" />}
          title="Aún no sigues ninguna keyword"
          description="Añade consultas para vigilar su posición y clics a lo largo del tiempo, igual que un rank tracker pero con tus datos reales de Search Console."
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 text-right">Posición</th>
                  <th className="px-4 py-3 text-right">Clics</th>
                  <th className="px-4 py-3 text-right">Impresiones</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => {
                  const isSelected = selected === keyword.query;
                  return (
                    <tr
                      key={keyword.query}
                      className={`border-b border-slate-100 last:border-0 ${isSelected ? 'bg-brand-subtle' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : keyword.query)}
                          className="flex items-center gap-2 text-left font-semibold text-slate-900 transition hover:text-brand-700"
                          title="Ver evolución"
                        >
                          <LineChart
                            size={14}
                            className="shrink-0 text-brand-500"
                            aria-hidden="true"
                          />
                          <span className="max-w-[20rem] truncate">{keyword.query}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatPosition(keyword.position)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatNumber(keyword.clicks)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatNumber(keyword.impressions)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatPercent(keyword.ctr)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onUntrack(keyword.query)}
                          className="inline-grid size-8 place-items-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                          aria-label={`Dejar de seguir ${keyword.query}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected ? (
        <KeywordTimeseries
          siteId={siteId}
          query={selected}
          startDate={startDate}
          endDate={endDate}
        />
      ) : null}
    </div>
  );
}

function KeywordTimeseries({
  siteId,
  query,
  startDate,
  endDate,
}: {
  siteId: string;
  query: string;
  startDate: string;
  endDate: string;
}) {
  const auth = useAuth();
  const series = useQuery({
    queryKey: ['search-console-keyword-series', siteId, query, startDate, endDate] as const,
    queryFn: () =>
      auth.api.get<TimeseriesPoint[]>(
        `/sites/${siteId}/search-console/performance/keyword-timeseries?${rangeParams(
          startDate,
          endDate,
        )}&query=${encodeURIComponent(query)}`,
      ),
    enabled: Boolean(auth.accessToken && siteId && query),
  });

  const points = series.data ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        <LineChart size={14} className="text-brand-500" aria-hidden="true" />
        Evolución · {query}
      </h3>
      {series.isLoading ? (
        <div className="mt-3 h-[260px] w-full animate-pulse rounded-lg bg-slate-100" />
      ) : points.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Sin datos para esta keyword en el periodo seleccionado.
        </p>
      ) : (
        <div className="mt-3">
          <ClicksImpressionsChart points={points} />
        </div>
      )}
    </section>
  );
}
