import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDate } from '#/lib/date-format';

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  emphasize?: boolean;
}

export type YAxisDomain = [
  number | 'auto' | 'dataMin' | 'dataMax',
  number | 'auto' | 'dataMin' | 'dataMax',
];

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
  yDomain?: YAxisDomain;
  yAxisWidth?: number;
  yTickFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: unknown) => string;
};

export default function MultiSeriesTrendChartRecharts({
  data,
  series,
  height,
  yDomain = [0, 100],
  yAxisWidth = 28,
  yTickFormatter,
  tooltipValueFormatter,
}: MultiSeriesTrendChartProps) {
  const dataWithLabel = data.map((p) => ({ ...p, label: formatShortDate(p.timestamp) }));
  const tooltipFormatter = tooltipValueFormatter
    ? (value: unknown, name: unknown) => [tooltipValueFormatter(value), String(name)]
    : undefined;

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
          domain={yDomain}
          ticks={yDomain[1] === 100 ? [0, 25, 50, 75, 100] : undefined}
          tickFormatter={yTickFormatter}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
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
          formatter={tooltipFormatter}
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
}
