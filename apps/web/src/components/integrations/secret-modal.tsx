import { Copy, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useEffect, useReducer } from 'react';

import { Button } from '../button';
import { Modal } from '../modal';
import { Notice } from '../notice';
import { Skeleton } from '../skeleton';
import { useAuth } from '../../lib/auth-context';
import type { OutboundWebhook } from './integrations-types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: OutboundWebhook;
  basePath: string;
  /** Notify caller after rotation so it can invalidate any cached view. */
  onRotated: () => void;
};

type SecretModalState = {
  secret: string | null;
  error: string | null;
  copied: boolean;
  loading: boolean;
  rotating: boolean;
  visible: boolean;
};

type SecretModalAction =
  | { type: 'closed' }
  | { type: 'loading' }
  | { type: 'loaded'; secret: string }
  | { type: 'failed'; message: string }
  | { type: 'copy-success' }
  | { type: 'copy-reset' }
  | { type: 'toggle-visible' }
  | { type: 'rotate-start' }
  | { type: 'rotate-success'; secret: string }
  | { type: 'rotate-failed'; message: string };

const initialSecretModalState: SecretModalState = {
  secret: null,
  error: null,
  copied: false,
  loading: false,
  rotating: false,
  visible: false,
};

function secretModalReducer(state: SecretModalState, action: SecretModalAction): SecretModalState {
  switch (action.type) {
    case 'closed':
      return initialSecretModalState;
    case 'loading':
      return { ...state, error: null, loading: true };
    case 'loaded':
      return { ...state, secret: action.secret, loading: false };
    case 'failed':
      return { ...state, error: action.message, loading: false };
    case 'copy-success':
      return { ...state, copied: true };
    case 'copy-reset':
      return { ...state, copied: false };
    case 'toggle-visible':
      return { ...state, visible: !state.visible };
    case 'rotate-start':
      return { ...state, error: null, rotating: true };
    case 'rotate-success':
      return { ...state, secret: action.secret, rotating: false };
    case 'rotate-failed':
      return { ...state, error: action.message, rotating: false };
    default:
      return state;
  }
}

/**
 * Modal that fetches the shared signing secret for a webhook on open and
 * offers copy / show-hide / rotate actions. Each open re-fetches the value
 * (the secret is only kept in component state for the lifetime of the modal).
 */
export function SecretModal({ open, onOpenChange, webhook, basePath, onRotated }: Props) {
  const auth = useAuth();
  const [state, dispatch] = useReducer(secretModalReducer, initialSecretModalState);
  const { secret, error, copied, loading, rotating, visible } = state;

  useEffect(() => {
    if (!open) {
      dispatch({ type: 'closed' });
      return;
    }
    let cancelled = false;
    dispatch({ type: 'loading' });
    auth.api
      .get<{ secret: string }>(`${basePath}/${webhook.id}/secret`)
      .then((res) => {
        if (!cancelled) dispatch({ type: 'loaded', secret: res.secret });
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'failed',
            message:
              caughtError instanceof Error ? caughtError.message : 'No se pudo cargar el secreto',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, auth.api, basePath, webhook.id]);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      dispatch({ type: 'copy-success' });
      setTimeout(() => dispatch({ type: 'copy-reset' }), 2000);
    } catch {
      dispatch({ type: 'failed', message: 'No se pudo copiar al portapapeles' });
    }
  };

  const rotate = async () => {
    dispatch({ type: 'rotate-start' });
    try {
      await auth.api.post(`${basePath}/${webhook.id}/rotate-secret`);
      const res = await auth.api.get<{ secret: string }>(`${basePath}/${webhook.id}/secret`);
      dispatch({ type: 'rotate-success', secret: res.secret });
      onRotated();
    } catch (caughtError) {
      dispatch({
        type: 'rotate-failed',
        message: caughtError instanceof Error ? caughtError.message : 'No se pudo rotar el secreto',
      });
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={webhook.name}
      description="Usa este secreto compartido para validar que los envíos proceden de SEOTracker."
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Secreto compartido
            </div>
            {copied ? (
              <span className="text-[11px] font-semibold text-emerald-600">Copiado ✓</span>
            ) : null}
          </div>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : secret ? (
            <div className="flex items-stretch gap-2">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs break-all text-slate-900">
                {visible ? secret : '•'.repeat(Math.min(secret.length, 48))}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'toggle-visible' })}
                aria-label={visible ? 'Ocultar secreto' : 'Mostrar secreto'}
                className="inline-flex w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                {visible ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={copy}
                aria-label="Copiar secreto"
                className="inline-flex w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                <Copy size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Sin secreto disponible.
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={rotate}
              disabled={rotating || loading}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {rotating ? 'Rotando...' : 'Rotar secreto'}
            </Button>
          </div>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Modal>
  );
}
