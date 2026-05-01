import { Skeleton } from '#/components/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-[6rem] rounded-2xl" />
      <div className="grid gap-6 xl:grid-cols-[1.8fr_0.9fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
