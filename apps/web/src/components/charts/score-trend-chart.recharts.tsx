import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactDateTime, formatShortDate } from '#/lib/date-format';

export interface TrendChartPoint {
  date: string;
  score: number;
}

type ChartDatum = {
  date: string;
  delta: number | null;
  label: string;
  score: number;
  timestamp: number;
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

export default function ScoreTrendChartRecharts({
  points,
  height,
}: {
  points: TrendChartPoint[];
  height: number;
}) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const data: ChartDatum[] = points.map((p, index) => {
    const previous = points[index - 1];
    return {
      date: p.date,
      delta: previous ? p.score - previous.score : null,
      label: formatShortDate(p.date),
      score: p.score,
      timestamp: new Date(p.date).getTime(),
    };
  });
  const activeDatum = activePoint ? data[activePoint.index] : undefined;

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <AreaChart
          accessibilityLayer={false}
          data={data}
          margin={{ top: 16, right: 12, left: -12, bottom: 4 }}
          onMouseDown={(_, event) => {
            event.currentTarget.blur();
          }}
          onMouseLeave={() => setActivePoint(null)}
          onMouseMove={(state: ChartMouseState) => {
            const index =
              state.activeTooltipIndex === undefined ? Number.NaN : Number(state.activeTooltipIndex);
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
          <defs>
            <linearGradient id="dashboard-trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="dashboard-trend-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(14, 165, 233)" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(226, 232, 240)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 11, fill: 'rgb(100, 116, 139)', fontWeight: 600 }}
            tickFormatter={(value) => formatShortDate(new Date(Number(value)).toISOString())}
            axisLine={{ stroke: 'rgb(226, 232, 240)' }}
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
          {activeDatum ? (
            <ReferenceLine
              x={activeDatum.timestamp}
              stroke="rgb(99, 102, 241)"
              strokeDasharray="2 3"
              strokeWidth={1.5}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="score"
            stroke="url(#dashboard-trend-line)"
            strokeWidth={2.5}
            fill="url(#dashboard-trend-area)"
            dot={{ r: 2.5, fill: 'white', stroke: 'rgb(79, 70, 229)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'white', stroke: 'rgb(79, 70, 229)', strokeWidth: 3 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {activeDatum && activePoint ? (
        <ScoreTooltip point={activeDatum} x={activePoint.x} y={activePoint.y} />
      ) : null}
    </div>
  );
}

function ScoreTooltip({ point, x, y }: { point: ChartDatum; x: number; y: number }) {
  const deltaLabel =
    point.delta === null ? 'Primer punto' : `${point.delta > 0 ? '+' : ''}${point.delta} vs. anterior`;

  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{
        left: x,
        top: Math.max(y - 72, 8),
        transform: x > 360 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
      }}
    >
      <p className="font-semibold text-slate-700">{formatCompactDateTime(point.date)}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-black text-slate-950">{point.score}</span>
        <span className="font-semibold text-slate-500">/ 100</span>
      </div>
      <p
        className={
          point.delta === null
            ? 'mt-1 font-semibold text-slate-500'
            : point.delta >= 0
              ? 'mt-1 font-semibold text-emerald-600'
              : 'mt-1 font-semibold text-rose-600'
        }
      >
        {deltaLabel}
      </p>
    </div>
  );
}
