import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactDateTime, formatShortDate } from '#/lib/date-format';

export interface DomainTrendPoint {
  date: string;
  score: number;
  siteDomain?: string;
  siteId?: string;
  siteName?: string;
}

type SeriesDef = {
  color: string;
  domain: string;
  key: string;
  label: string;
};

type ChartDatum = {
  date: string;
  score: number;
  siteKey: string;
  timestamp: number;
  [seriesKey: string]: number | string;
};

type ActivePoint = {
  index: number;
  x: number;
  y: number;
};

type ChartMouseState = {
  activeCoordinate?: { x: number; y: number };
  activeTooltipIndex?: null | number | string;
};

const SERIES_COLORS = [
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

export default function DomainScoreTrendChartRecharts({
  points,
  height,
}: {
  points: DomainTrendPoint[];
  height: number;
}) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const { data, series } = useMemo(() => {
    const bySite = new Map<string, SeriesDef>();

    for (const point of points) {
      const key = point.siteId ?? point.siteDomain ?? 'unknown';
      if (!bySite.has(key)) {
        bySite.set(key, {
          color: SERIES_COLORS[bySite.size % SERIES_COLORS.length] ?? '#64748b',
          domain: point.siteDomain ?? point.siteName ?? 'Dominio',
          key,
          label: point.siteName ?? point.siteDomain ?? 'Dominio',
        });
      }
    }

    const rows = points.map((point) => {
      const siteKey = point.siteId ?? point.siteDomain ?? 'unknown';
      return {
        [siteKey]: point.score,
        date: point.date,
        score: point.score,
        siteKey,
        timestamp: new Date(point.date).getTime(),
      } as ChartDatum;
    });

    return { data: rows, series: [...bySite.values()] };
  }, [points]);

  const activeDatum = activePoint ? data[activePoint.index] : undefined;
  const activeSeries = activeDatum ? series.find((item) => item.key === activeDatum.siteKey) : null;

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <LineChart
          accessibilityLayer={false}
          data={data}
          margin={{ top: 12, right: 14, left: -12, bottom: 8 }}
          onMouseDown={(_, event) => {
            event.currentTarget.blur();
          }}
          onMouseLeave={() => setActivePoint(null)}
          onMouseMove={(state: ChartMouseState) => {
            const index =
              state.activeTooltipIndex === undefined
                ? Number.NaN
                : Number(state.activeTooltipIndex);
            const coordinate = state.activeCoordinate;
            if (!Number.isInteger(index) || !coordinate || !data[index]) {
              setActivePoint(null);
              return;
            }
            setActivePoint({ index, x: coordinate.x, y: coordinate.y });
          }}
          role="img"
          tabIndex={-1}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 11, fill: 'rgb(100, 116, 139)', fontWeight: 600 }}
            tickFormatter={(value) => formatShortDate(new Date(Number(value)).toISOString())}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: 'rgb(100, 116, 139)', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 6 }}
          />
          {activeDatum ? (
            <ReferenceLine
              x={activeDatum.timestamp}
              stroke="rgb(99, 102, 241)"
              strokeDasharray="2 3"
              strokeWidth={1.5}
            />
          ) : null}
          {series.map((item) => (
            <Line
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls
              dataKey={item.key}
              dot={{ r: 3, strokeWidth: 1.5 }}
              isAnimationActive={false}
              key={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {activeDatum && activePoint && activeSeries ? (
        <DomainTooltip
          point={activeDatum}
          series={activeSeries}
          x={activePoint.x}
          y={activePoint.y}
        />
      ) : null}
    </div>
  );
}

function DomainTooltip({
  point,
  series,
  x,
  y,
}: {
  point: ChartDatum;
  series: SeriesDef;
  x: number;
  y: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{
        left: x,
        top: Math.max(y - 82, 8),
        transform: x > 360 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
        <p className="font-bold text-slate-800">{series.label}</p>
      </div>
      <p className="mt-1 text-slate-500">{series.domain}</p>
      <p className="mt-1 font-semibold text-slate-600">{formatCompactDateTime(point.date)}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-black text-slate-950">{point.score}</span>
        <span className="font-semibold text-slate-500">/ 100</span>
      </div>
    </div>
  );
}
