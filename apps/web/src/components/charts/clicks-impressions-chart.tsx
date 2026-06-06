import { lazy, Suspense } from 'react';

import type { ClicksImpressionsPoint } from './clicks-impressions-chart.recharts';

const ClicksImpressionsChartRecharts = lazy(() => import('./clicks-impressions-chart.recharts'));

export type { ClicksImpressionsPoint };

export function ClicksImpressionsChart({
  points,
  height = 260,
}: {
  points: ClicksImpressionsPoint[];
  height?: number;
}) {
  return (
    <div className="clicks-impressions-chart" style={{ height }}>
      <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />}>
        <ClicksImpressionsChartRecharts points={points} height={height} />
      </Suspense>
    </div>
  );
}
