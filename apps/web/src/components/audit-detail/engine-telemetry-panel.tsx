import { useQuery } from '@tanstack/react-query';
import type { EngineRunTimeline } from '@seotracker/shared-types';
import { AlertTriangle, Gauge } from 'lucide-react';

import { useAuth } from '#/lib/auth-context';
import { usePlatformAdmin } from '#/lib/use-platform-admin';
import { humanizeStage } from '#/components/engine-health/stage-labels';
import { CollapsibleSection } from './collapsible-section';
import { formatDuration } from './audit-detail-formatters';

/**
 * Per-audit "engine performance" waterfall. Reads the stage-by-stage execution
 * trace the SEO engine persisted for this run and renders where the time went,
 * surfacing any stage that errored. Consumes GET /audits/:id/engine-telemetry.
 */
export function EngineTelemetryPanel({ auditId }: { auditId: string }) {
  const auth = useAuth();
  const isPlatformAdmin = usePlatformAdmin();
  const { data, isLoading } = useQuery({
    queryKey: ['audit-engine-telemetry', auditId],
    queryFn: () => auth.api.get<EngineRunTimeline>(`/audits/${auditId}/engine-telemetry`),
    enabled: Boolean(auth.accessToken && isPlatformAdmin),
  });

  // Internal observability: only platform operators see the engine waterfall.
  if (!isPlatformAdmin) return null;

  const stages = data?.stages ?? [];
  const maxDuration = stages.reduce((max, s) => Math.max(max, s.durationMs), 0);

  return (
    <CollapsibleSection title="Rendimiento del motor" count={stages.length}>
      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando telemetría del motor…</p>
      ) : stages.length === 0 ? (
        <p className="text-sm text-slate-500">Esta auditoría no registró telemetría por etapa.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <Gauge size={13} aria-hidden="true" />
              {formatDuration(data?.totalDurationMs ?? 0)} en total
            </span>
            <span>{stages.length} etapas</span>
            {data && data.errorCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-rose-600">
                <AlertTriangle size={13} aria-hidden="true" />
                {data.errorCount} con error
              </span>
            ) : (
              <span className="text-emerald-600">Sin errores</span>
            )}
            {data?.scoringModelVersion ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                modelo {data.scoringModelVersion}
              </span>
            ) : null}
          </div>

          <ul className="space-y-2.5">
            {stages.map((stage) => {
              const isError = stage.status === 'error';
              const widthPct =
                maxDuration > 0 ? Math.max(2, (stage.durationMs / maxDuration) * 100) : 2;
              const detailEntries = stage.details ? Object.entries(stage.details) : [];
              return (
                <li key={stage.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${isError ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{humanizeStage(stage.stage)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                      {formatDuration(stage.durationMs)}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${humanizeStage(stage.stage)}: ${formatDuration(stage.durationMs)}`}
                  >
                    <div
                      className={`h-full rounded-full ${isError ? 'bg-rose-400' : 'bg-brand-500'}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  {isError && stage.error ? (
                    <p className="rounded-md bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-700">
                      {stage.error}
                    </p>
                  ) : null}
                  {detailEntries.length > 0 ? (
                    <dl className="flex flex-wrap gap-x-4 gap-y-0.5 pl-3.5 text-[11px] text-slate-500">
                      {detailEntries.map(([key, value]) => (
                        <div key={key} className="inline-flex items-center gap-1">
                          <dt>{key}:</dt>
                          <dd className="font-mono tabular-nums text-slate-600">
                            {formatDetailValue(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </CollapsibleSection>
  );
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
