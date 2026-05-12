import { lazy } from 'react';
import { formatShortDate } from '#/lib/date-format';

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  emphasize?: boolean;
}

export interface MultiSeriesPoint {
  id: string;
  timestamp: string;
  isRegression?: boolean;
  [seriesKey: string]: unknown;
}

type MultiSeriesTrendChartProps = {
  data: MultiSeriesPoint[];
  series: SeriesDef[];
  height: number;
};

type RechartsModule = Pick<
  Awaited<ReturnType<typeof importRecharts>>,
  'CartesianGrid' | 'Line' | 'LineChart' | 'ResponsiveContainer' | 'Tooltip' | 'XAxis' | 'YAxis'
>;

function createMultiSeriesTrendChartRecharts({
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
}: RechartsModule) {
  return function MultiSeriesTrendChartRecharts({
    data,
    series,
    height,
  }: MultiSeriesTrendChartProps) {
    const dataWithLabel = data.map((p) => ({ ...p, label: formatShortDate(p.timestamp) }));

    return (
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <LineChart
          accessibilityLayer={false}
          data={dataWithLabel}
          margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
        >
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
                  ? (props: unknown) => {
                      const { cx, cy, payload } = props as {
                        cx: number;
                        cy: number;
                        payload: MultiSeriesPoint;
                      };
                      const isReg = payload.isRegression === true;
                      return (
                        <circle
                          key={`${s.key}-${payload.id}`}
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
    );
  };
}

function importRecharts() {
  return import('recharts');
}

export default lazy(async () => {
  const recharts = await importRecharts();
  return { default: createMultiSeriesTrendChartRecharts(recharts) };
});
