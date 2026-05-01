import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, KeyRound, Radio, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '../badge';
import { Button } from '../button';
import { Notice } from '../notice';
import { SwitchField } from '../switch-field';
import { useAuth } from '../../lib/auth-context';
import { DeliveriesHistory } from './deliveries-history';
import {
  ALL_EVENTS,
  EVENT_LABELS,
  type OutboundDelivery,
  type OutboundWebhook,
} from './integrations-types';
import { SecretModal } from './secret-modal';

type Props = {
  webhook: OutboundWebhook;
  basePath: string;
  onToggle: () => void;
  onDelete: () => void;
  onEventsChange: (events: string[]) => void;
  onRotated: () => void;
};

/**
 * Card that bundles everything a single outbound webhook needs:
 * status badge + enable/disable + event toggles + test send + secret view +
 * deliveries history. The mutations the route file owns are wired in via
 * intent callbacks (`onToggle`, `onDelete`, `onEventsChange`); this component
 * owns the local UI state (modal open, panel expanded, test feedback toast).
 */
export function WebhookCard({
  webhook,
  basePath,
  onToggle,
  onDelete,
  onEventsChange,
  onRotated,
}: Props) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);

  const sendTest = useMutation({
    mutationFn: () => auth.api.post<OutboundDelivery>(`${basePath}/${webhook.id}/test`),
    onSuccess: async () => {
      setTestFeedback({
        tone: 'success',
        message: 'Prueba encolada. Aparecerá en el historial en unos segundos.',
      });
      setShowDeliveries(true);
      await queryClient.invalidateQueries({
        queryKey: ['outbound-webhook-deliveries', webhook.id],
      });
    },
    onError: (error) => {
      setTestFeedback({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'No se pudo enviar la prueba',
      });
    },
  });

  // Auto-dismiss the inline test feedback after a few seconds; the deliveries
  // history surfaces the actual outcome anyway.
  useEffect(() => {
    if (!testFeedback) return;
    const t = setTimeout(() => setTestFeedback(null), 4500);
    return () => clearTimeout(t);
  }, [testFeedback]);

  const toggleEvent = (event: string) => {
    const next = webhook.events.includes(event)
      ? webhook.events.filter((ev) => ev !== event)
      : [...webhook.events, event];
    if (next.length === 0) return;
    onEventsChange(next);
  };

  return (
    <li className="space-y-4 rounded-2xl border border-slate-200 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-slate-950">{webhook.name}</div>
            <Badge tone={webhook.enabled ? 'success' : 'neutral'}>
              {webhook.enabled ? 'Activo' : 'Pausado'}
            </Badge>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-500">{webhook.url}</div>
          {webhook.headerName ? (
            <div className="mt-1 font-mono text-[11px] text-slate-400">
              Header: {webhook.headerName}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <SwitchField
            label={webhook.enabled ? 'Activo' : 'Pausado'}
            checked={webhook.enabled}
            onCheckedChange={onToggle}
            className="min-w-36 border-none px-0 py-0"
          />
          <Button type="button" variant="secondary" size="sm" onClick={onDelete}>
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_EVENTS.map((event) => {
          const active = webhook.events.includes(event);
          return (
            <button
              key={event}
              type="button"
              onClick={() => toggleEvent(event)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Radio size={11} aria-hidden="true" />
              {EVENT_LABELS[event] ?? event}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => sendTest.mutate()}
          disabled={sendTest.isPending || !webhook.enabled}
          title={!webhook.enabled ? 'Activa la integración para enviar pruebas' : undefined}
        >
          <SendHorizontal size={14} aria-hidden="true" />
          {sendTest.isPending ? 'Enviando...' : 'Enviar prueba'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSecretModalOpen(true)}
        >
          <KeyRound size={14} aria-hidden="true" />
          Secreto
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowDeliveries((prev) => !prev)}
        >
          {showDeliveries ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
          Historial
        </Button>
      </div>

      {testFeedback ? <Notice tone={testFeedback.tone}>{testFeedback.message}</Notice> : null}

      {showDeliveries ? (
        <DeliveriesHistory webhookId={webhook.id} basePath={basePath} enabled={showDeliveries} />
      ) : null}

      <SecretModal
        open={secretModalOpen}
        onOpenChange={setSecretModalOpen}
        webhook={webhook}
        basePath={basePath}
        onRotated={onRotated}
      />
    </li>
  );
}
