import { lazy, Suspense } from 'react';
import type { MultiSeriesPoint, SeriesDef } from './multi-series-trend-chart.recharts';

const MultiSeriesTrendChartRecharts = lazy(() => import('./multi-series-trend-chart.recharts'));

export function MultiSeriesTrendChart({
  data,
  series,
  height = 200,
}: {
  data: MultiSeriesPoint[];
  series: SeriesDef[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Suspense fallback={<ChartFallback />}>
        <MultiSeriesTrendChartRecharts data={data} series={series} height={height} />
      </Suspense>
    </div>
  );
}

function ChartFallback() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />;
}
