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

export interface ClicksImpressionsPoint {
  date: string;
  clicks: number;
  impressions: number;
}

const CLICKS_COLOR = '#1d4ed8';
const IMPRESSIONS_COLOR = '#0ea5e9';

const COMPACT_NUMBER = new Intl.NumberFormat('es-ES', { notation: 'compact' });

export default function ClicksImpressionsChartRecharts({
  points,
  height,
}: {
  points: ClicksImpressionsPoint[];
  height: number;
}) {
  const data = points.map((point) => ({ ...point, label: formatShortDate(point.date) }));

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
      <LineChart
        accessibilityLayer={false}
        data={data}
        margin={{ top: 8, right: 8, left: -8, bottom: 4 }}
      >
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          yAxisId="clicks"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(value: number) => COMPACT_NUMBER.format(value)}
        />
        <YAxis
          yAxisId="impressions"
          orientation="right"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(value: number) => COMPACT_NUMBER.format(value)}
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
        <Line
          yAxisId="clicks"
          type="monotone"
          dataKey="clicks"
          name="Clicks"
          stroke={CLICKS_COLOR}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          yAxisId="impressions"
          type="monotone"
          dataKey="impressions"
          name="Impresiones"
          stroke={IMPRESSIONS_COLOR}
          strokeWidth={1.6}
          strokeOpacity={0.8}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
