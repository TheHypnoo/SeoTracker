import { lazy, Suspense } from 'react';
import type { MultiSeriesPoint, SeriesDef, YAxisDomain } from './multi-series-trend-chart.recharts';

const MultiSeriesTrendChartRecharts = lazy(() => import('./multi-series-trend-chart.recharts'));

export function MultiSeriesTrendChart({
  data,
  series,
  height = 200,
  yDomain,
  yAxisWidth,
  yTickFormatter,
  tooltipValueFormatter,
}: {
  data: MultiSeriesPoint[];
  series: SeriesDef[];
  height?: number;
  yDomain?: YAxisDomain;
  yAxisWidth?: number;
  yTickFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: unknown) => string;
}) {
  return (
    <div style={{ height }}>
      <Suspense fallback={<ChartFallback />}>
        <MultiSeriesTrendChartRecharts
          data={data}
          series={series}
          height={height}
          yDomain={yDomain}
          yAxisWidth={yAxisWidth}
          yTickFormatter={yTickFormatter}
          tooltipValueFormatter={tooltipValueFormatter}
        />
      </Suspense>
    </div>
  );
}

function ChartFallback() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />;
}
