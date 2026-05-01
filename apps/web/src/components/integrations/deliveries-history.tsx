import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

import { Badge } from '../badge';
import { Button } from '../button';
import { QueryState } from '../query-state';
import { Skeleton } from '../skeleton';
import { useAuth } from '../../lib/auth-context';
import { REFETCH_INTERVALS } from '../../lib/refetch-intervals';
import { type OutboundDelivery, STATUS_TONE, statusLabel } from './integrations-types';

type Props = {
  webhookId: string;
  basePath: string;
  /** Render the panel only when the user has expanded it. */
  enabled: boolean;
};

/**
 * Shows the last N deliveries (HTTP attempts) for a webhook with status code,
 * attempt count and error excerpt. Polls every 5s while expanded so a fresh
 * "Test" delivery appears without manual refresh.
 */
export function DeliveriesHistory({ webhookId, basePath, enabled }: Props) {
  const auth = useAuth();
  const deliveriesKey = ['outbound-webhook-deliveries', webhookId] as const;

  const deliveries = useQuery({
    queryKey: deliveriesKey,
    queryFn: () => auth.api.get<OutboundDelivery[]>(`${basePath}/${webhookId}/deliveries?limit=15`),
    enabled,
    refetchInterval: enabled ? REFETCH_INTERVALS.DELIVERIES_MS : false,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Historial de entregas</div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            Cada fila es un envío HTTP a tu URL. Aparece el evento, el código HTTP que devolvió tu
            servidor y los intentos realizados (reintentamos con backoff si falla).
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => deliveries.refetch()}
          disabled={deliveries.isFetching}
        >
          <RotateCcw size={13} aria-hidden="true" />
          Refrescar
        </Button>
      </div>
      <QueryState
        status={deliveries.status}
        data={deliveries.data}
        error={deliveries.error}
        onRetry={() => deliveries.refetch()}
        isEmpty={(list) => list.length === 0}
        loading={
          <ul className="space-y-2">
            {['d1', 'd2'].map((slot) => (
              <li key={slot} className="rounded-lg bg-white px-3 py-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="mt-2 h-2 w-1/3" />
              </li>
            ))}
          </ul>
        }
        empty={
          <div className="py-4 text-center text-xs text-slate-500">
            Aún no hay envíos. Pulsa «Enviar prueba» para generar uno.
          </div>
        }
      >
        {(list) => (
          <ul className="space-y-2">
            {list.map((delivery) => (
              <li
                key={delivery.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={STATUS_TONE[delivery.status]}>
                      {statusLabel(delivery.status)}
                    </Badge>
                    <span className="font-mono text-xs text-slate-600">{delivery.event}</span>
                    {delivery.statusCode ? (
                      <span className="font-mono text-[11px] text-slate-500">
                        HTTP {delivery.statusCode}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(delivery.createdAt).toLocaleString()} ·{' '}
                    {delivery.attemptCount === 1
                      ? '1 intento'
                      : `${delivery.attemptCount} intentos`}
                  </div>
                </div>
                {delivery.errorMessage ? (
                  <div className="mt-1 truncate text-[11px] text-rose-600">
                    {delivery.errorMessage}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
