import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendChartPoint {
  date: string;
  score: number;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) {
    return '';
  }
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

export function ScoreTrendChart({
  points,
  height = 240,
}: {
  points: TrendChartPoint[];
  height?: number;
}) {
  const data = points.map((p) => ({ date: p.date, label: fmtDate(p.date), score: p.score }));

  return (
    <div style={{ height }}>
      {/* initialDimension avoids Recharts 3 spurious "width(-1)" warning before
          ResizeObserver measures the parent. See recharts#6716 (fix in #7174,
          unreleased as of 3.8.1). Real size is taken over once measured. */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <AreaChart data={data} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
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
            dataKey="label"
            tick={{ fontSize: 11, fill: 'rgb(100, 116, 139)', fontWeight: 600 }}
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
          <Tooltip
            cursor={{ stroke: 'rgb(99, 102, 241)', strokeDasharray: '2 3' }}
            contentStyle={{
              background: 'white',
              border: '1px solid rgb(226, 232, 240)',
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 10px',
            }}
            labelStyle={{ color: 'rgb(71, 85, 105)', fontWeight: 600 }}
            formatter={(value) => [`${value}`, 'Score']}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="url(#dashboard-trend-line)"
            strokeWidth={2.5}
            fill="url(#dashboard-trend-area)"
            dot={{ r: 2.5, fill: 'white', stroke: 'rgb(79, 70, 229)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'white', stroke: 'rgb(79, 70, 229)', strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
