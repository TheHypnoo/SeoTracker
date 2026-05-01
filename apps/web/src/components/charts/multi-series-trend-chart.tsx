import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  emphasize?: boolean;
}

interface MultiSeriesPoint {
  id: string;
  timestamp: string;
  isRegression?: boolean;
  [seriesKey: string]: unknown;
}

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) {
    return '';
  }
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

export function MultiSeriesTrendChart({
  data,
  series,
  height = 200,
}: {
  data: MultiSeriesPoint[];
  series: SeriesDef[];
  height?: number;
}) {
  const dataWithLabel = data.map((p) => ({ ...p, label: formatTimestamp(p.timestamp) }));

  return (
    <div style={{ height }}>
      {/* See note in score-trend-chart.tsx: workaround for recharts#6716. */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <LineChart data={dataWithLabel} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeDasharray: '2 3' }}
            contentStyle={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 11,
              padding: '6px 10px',
            }}
            labelStyle={{ color: '#475569', fontWeight: 600 }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeOpacity={s.emphasize ? 1 : 0.7}
              strokeWidth={s.emphasize ? 2.2 : 1.5}
              dot={
                s.emphasize
                  ? (props) => {
                      const { cx, cy, payload, index } = props as {
                        cx: number;
                        cy: number;
                        payload: MultiSeriesPoint;
                        index: number;
                      };
                      const isReg = payload.isRegression === true;
                      return (
                        <circle
                          key={`${s.key}-${index}`}
                          cx={cx}
                          cy={cy}
                          r={isReg ? 4.5 : 3}
                          fill={isReg ? '#e11d48' : s.color}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      );
                    }
                  : false
              }
              activeDot={s.emphasize ? { r: 5 } : false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
