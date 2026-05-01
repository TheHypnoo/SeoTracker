import { useMemo, useState } from 'react';
import { MultiSeriesTrendChart } from '#/components/charts/multi-series-trend-chart';
import type { TrendPoint } from './types';

const TREND_CATEGORY_LABELS: Record<string, string> = {
  CONTENT: 'Contenido',
  CRAWLABILITY: 'Crawlability',
  MEDIA: 'Medios',
  ON_PAGE: 'On-page',
  PERFORMANCE: 'Rendimiento',
  SECURITY: 'Seguridad',
  STRUCTURED_DATA: 'Datos estructurados',
  TECHNICAL: 'Técnico',
};

const TREND_CATEGORY_COLORS: Record<string, string> = {
  CONTENT: '#14b8a6',
  CRAWLABILITY: '#10b981',
  MEDIA: '#f59e0b',
  ON_PAGE: '#0ea5e9',
  PERFORMANCE: '#ef4444',
  SECURITY: '#f43f5e',
  STRUCTURED_DATA: '#8b5cf6',
  TECHNICAL: '#6366f1',
};

export function TrendsPanel({
  points,
  onCompare,
}: {
  points: TrendPoint[];
  onCompare: (fromId: string, toId: string) => void;
}) {
  const [showCategories, setShowCategories] = useState(false);

  const scoredPoints = points.filter((p): p is TrendPoint & { score: number } => p.score !== null);

  const regressions = scoredPoints.filter((p) => p.scoreDelta !== null && p.scoreDelta < 0);

  const first = scoredPoints[0];
  const last = scoredPoints.at(-1);
  const overallDelta = first && last ? last.score - first.score : 0;

  const categoriesPresent = useMemo(() => {
    if (!showCategories) {
      return [] as string[];
    }
    const set = new Set<string>();
    for (const p of scoredPoints) {
      if (p.categoryScores) {
        for (const k of Object.keys(p.categoryScores)) {
          set.add(k);
        }
      }
    }
    return [...set];
  }, [scoredPoints, showCategories]);

  const chartData = useMemo(
    () =>
      scoredPoints.map((p) => {
        const row: {
          id: string;
          timestamp: string;
          isRegression: boolean;
          [key: string]: unknown;
        } = {
          id: p.id,
          isRegression: p.scoreDelta !== null && p.scoreDelta < 0,
          score: p.score,
          timestamp: p.timestamp,
        };
        if (p.categoryScores) {
          for (const [key, value] of Object.entries(p.categoryScores)) {
            if (typeof value === 'number') {
              row[key] = value;
            }
          }
        }
        return row;
      }),
    [scoredPoints],
  );

  const series = useMemo(() => {
    const result = [{ color: '#0f172a', emphasize: true, key: 'score', label: 'Score' }];
    for (const cat of categoriesPresent) {
      result.push({
        color: TREND_CATEGORY_COLORS[cat] ?? '#94a3b8',
        emphasize: false,
        key: cat,
        label: TREND_CATEGORY_LABELS[cat] ?? cat,
      });
    }
    return result;
  }, [categoriesPresent]);

  if (scoredPoints.length < 2 || !first || !last) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tendencias</h2>
          <p className="text-xs text-slate-500">
            Evolución del score en las últimas {scoredPoints.length} auditorías.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${
                overallDelta > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : overallDelta < 0
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {overallDelta > 0 ? '+' : ''}
              {overallDelta} vs. primer punto
            </span>
            {regressions.length > 0 ? (
              <span className="rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                {regressions.length} regresión
                {regressions.length === 1 ? '' : 'es'}
              </span>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showCategories}
              onChange={(event) => setShowCategories(event.currentTarget.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Desglose por categoría
          </label>
          <button
            type="button"
            onClick={() => onCompare(first.id, last.id)}
            className="btn-secondary inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
          >
            Comparar primera vs. última
          </button>
        </div>
      </div>

      <div className="mt-4">
        <MultiSeriesTrendChart data={chartData} series={series} />
      </div>

      {categoriesPresent.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
          {categoriesPresent.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: TREND_CATEGORY_COLORS[cat] ?? '#94a3b8' }}
              />
              {TREND_CATEGORY_LABELS[cat] ?? cat}
            </span>
          ))}
        </div>
      ) : null}

      {regressions.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Regresiones recientes
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {regressions.slice(-5).map((point) => {
              const prev = scoredPoints[scoredPoints.indexOf(point) - 1];
              return (
                <li key={point.id}>
                  <button
                    type="button"
                    onClick={() => prev && onCompare(prev.id, point.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    title="Abrir comparación con la auditoría previa"
                  >
                    <span>{new Date(point.timestamp).toLocaleDateString('es-ES')}</span>
                    <span>
                      {point.scoreDelta !== null
                        ? `${point.scoreDelta > 0 ? '+' : ''}${point.scoreDelta}`
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
