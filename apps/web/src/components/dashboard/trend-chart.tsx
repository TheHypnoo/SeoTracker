import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react';

type TrendPoint = { date: string; score: number };

/**
 * Hand-rolled inline SVG chart for the homepage trend block — kept here
 * (instead of pulling in recharts on the dashboard) because:
 *  - it's a single chart with fixed axis (0..100 score, time)
 *  - dashboard ships on every login → minimizing first-paint deps matters
 *  - the math is small enough (gridlines + line + area + ticks)
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const width = 720;
  const height = 240;
  const padX = 42;
  const padTop = 16;
  const padBottom = 34;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  const xFor = (idx: number) => padX + (idx / Math.max(points.length - 1, 1)) * innerW;
  const yFor = (score: number) => padTop + (1 - Math.min(Math.max(score, 0), 100) / 100) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.score).toFixed(2)}`)
    .join(' ');
  const bottomY = padTop + innerH;
  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(2)} ${bottomY} L ${xFor(0).toFixed(2)} ${bottomY} Z`;

  const gridLevels = [0, 25, 50, 75, 100];
  const last = points[points.length - 1];

  const xTickIndexes = (() => {
    if (points.length <= 1) return [0];
    if (points.length <= 4) return points.map((_, i) => i);
    const mid = Math.floor(points.length / 2);
    return [0, mid, points.length - 1];
  })();

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label="Tendencia de score SEO"
    >
      <defs>
        <linearGradient id="dashboard-trend-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dashboard-trend-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgb(14, 165, 233)" />
          <stop offset="100%" stopColor="rgb(99, 102, 241)" />
        </linearGradient>
      </defs>

      {gridLevels.map((level) => {
        const y = yFor(level);
        return (
          <g key={level}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="rgb(226, 232, 240)"
              strokeDasharray={level === 0 || level === 100 ? undefined : '3 4'}
              strokeWidth={level === 0 || level === 100 ? 1 : 1}
            />
            <text
              x={padX - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill="rgb(100, 116, 139)"
            >
              {level}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill="url(#dashboard-trend-area)" />
      <path
        d={linePath}
        fill="none"
        stroke="url(#dashboard-trend-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((p, i) => (
        <circle
          key={`${p.date}-${i}`}
          cx={xFor(i)}
          cy={yFor(p.score)}
          r={i === points.length - 1 ? 5 : 2.5}
          fill="white"
          stroke="rgb(79, 70, 229)"
          strokeWidth={i === points.length - 1 ? 3 : 2}
        />
      ))}

      {last ? (
        <line
          x1={xFor(points.length - 1)}
          x2={xFor(points.length - 1)}
          y1={yFor(last.score)}
          y2={bottomY}
          stroke="rgb(99, 102, 241)"
          strokeDasharray="2 3"
          strokeWidth="1"
          opacity="0.5"
        />
      ) : null}

      {xTickIndexes.map((idx) => {
        const p = points[idx];
        if (!p) return null;
        return (
          <text
            key={`xtick-${idx}`}
            x={xFor(idx)}
            y={height - 10}
            textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fontWeight="600"
            fill="rgb(100, 116, 139)"
          >
            {fmtDate(p.date)}
          </text>
        );
      })}
    </svg>
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
