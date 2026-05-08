import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DomainScoreTrendChart } from '#/components/charts/domain-score-trend-chart';
import { ScoreTrendChart } from '#/components/charts/score-trend-chart';

type TrendPoint = {
  date: string;
  score: number;
  siteDomain?: string;
  siteId?: string;
  siteName?: string;
};

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [mode, setMode] = useState<'global' | 'domains'>('global');
  const domainCount = useMemo(
    () =>
      new Set(
        points.flatMap((point) => {
          const key = point.siteId ?? point.siteDomain;
          return key ? [key] : [];
        }),
      ).size,
    [points],
  );
  const canCompareDomains = domainCount > 1;

  return (
    <div>
      {canCompareDomains ? (
        <div className="mb-3 flex justify-end">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                mode === 'global'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setMode('global')}
            >
              Global
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                mode === 'domains'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setMode('domains')}
            >
              Dominios
            </button>
          </div>
        </div>
      ) : null}
      {mode === 'domains' && canCompareDomains ? (
        <DomainScoreTrendChart points={points} height={240} />
      ) : (
        <ScoreTrendChart points={points} height={240} />
      )}
    </div>
  );
}

export function TrendDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
        <Minus size={12} /> Sin cambio
      </span>
    );
  }
  const positive = delta > 0;
  const cls = positive
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}
    >
      <Icon size={12} />
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

export function TrendStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'rose';
}) {
  const toneMap: Record<typeof tone, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  };
  return (
    <div>
      <p className="text-[0.65rem] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-0.5 text-xl font-black ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}

export function EmptyChartState({ hasSinglePoint }: { hasSinglePoint: boolean }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
      <Activity size={22} className="text-slate-400" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">
        {hasSinglePoint
          ? 'Hacen falta al menos dos auditorías para ver la tendencia'
          : 'Todavía no hay auditorías completadas'}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Lanza una auditoría desde un dominio para empezar a acumular histórico.
      </p>
    </div>
  );
}
