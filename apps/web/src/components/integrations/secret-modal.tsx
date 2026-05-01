import { Copy, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

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

/**
 * Modal that fetches the shared signing secret for a webhook on open and
 * offers copy / show-hide / rotate actions. Each open re-fetches the value
 * (the secret is only kept in component state for the lifetime of the modal).
 */
export function SecretModal({ open, onOpenChange, webhook, basePath, onRotated }: Props) {
  const auth = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setSecret(null);
      setError(null);
      setCopied(false);
      setVisible(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    auth.api
      .get<{ secret: string }>(`${basePath}/${webhook.id}/secret`)
      .then((res) => {
        if (!cancelled) setSecret(res.secret);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el secreto');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, auth.api, basePath, webhook.id]);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles');
    }
  };

  const rotate = async () => {
    setRotating(true);
    setError(null);
    try {
      await auth.api.post(`${basePath}/${webhook.id}/rotate-secret`);
      const res = await auth.api.get<{ secret: string }>(`${basePath}/${webhook.id}/secret`);
      setSecret(res.secret);
      onRotated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rotar el secreto');
    } finally {
      setRotating(false);
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
                onClick={() => setVisible((v) => !v)}
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
