import { lazy, Suspense } from 'react';
import type { DomainTrendPoint } from './domain-score-trend-chart.recharts';

const DomainScoreTrendChartRecharts = lazy(() => import('./domain-score-trend-chart.recharts'));

export function DomainScoreTrendChart({
  points,
  height = 240,
}: {
  points: DomainTrendPoint[];
  height?: number;
}) {
  return (
    <div className="score-trend-chart" style={{ height }}>
      <Suspense fallback={<ChartFallback />}>
        <DomainScoreTrendChartRecharts points={points} height={height} />
      </Suspense>
    </div>
  );
}

function ChartFallback() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />;
}
