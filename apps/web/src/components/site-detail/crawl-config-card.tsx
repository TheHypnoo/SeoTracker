import { Permission } from '@seotracker/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '#/components/button';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { useAuth } from '../../lib/auth-context';
import { usePermissions } from '../../lib/use-permissions';

type CrawlConfig = {
  maxPages: number;
  maxDepth: number;
  maxConcurrentPages: number;
  requestDelayMs: number;
  respectCrawlDelay: boolean;
  userAgent: string | null;
};

type FormState = {
  maxPages: string;
  maxDepth: string;
  maxConcurrentPages: string;
  requestDelayMs: string;
  respectCrawlDelay: boolean;
  userAgent: string;
};

function toForm(config: CrawlConfig): FormState {
  return {
    maxPages: String(config.maxPages),
    maxDepth: String(config.maxDepth),
    maxConcurrentPages: String(config.maxConcurrentPages),
    requestDelayMs: String(config.requestDelayMs),
    respectCrawlDelay: config.respectCrawlDelay,
    userAgent: config.userAgent ?? '',
  };
}

const HARD_CAP = {
  maxPages: 500,
  maxDepth: 5,
  maxConcurrentPages: 20,
  requestDelayMs: 5000,
};

/**
 * Per-site crawler tuning panel. Shown on the site detail page.
 * Owners with SCHEDULE_WRITE can edit; everyone else with SCHEDULE_READ
 * sees the resolved values read-only.
 */
export function CrawlConfigCard({ siteId, projectId }: { siteId: string; projectId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const authz = usePermissions(projectId);
  const canEdit = authz.can(Permission.SCHEDULE_WRITE);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = useQuery<CrawlConfig>({
    queryKey: ['crawl-config', siteId],
    queryFn: () => auth.api.get<CrawlConfig>(`/sites/${siteId}/crawl-config`),
    enabled: Boolean(auth.accessToken && siteId),
  });

  useEffect(() => {
    if (config.data && !form) setForm(toForm(config.data));
  }, [config.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Form not ready');
      const payload = {
        maxPages: Math.min(Math.max(Number(form.maxPages), 1), HARD_CAP.maxPages),
        maxDepth: Math.min(Math.max(Number(form.maxDepth), 1), HARD_CAP.maxDepth),
        maxConcurrentPages: Math.min(
          Math.max(Number(form.maxConcurrentPages), 1),
          HARD_CAP.maxConcurrentPages,
        ),
        requestDelayMs: Math.min(Math.max(Number(form.requestDelayMs), 0), HARD_CAP.requestDelayMs),
        respectCrawlDelay: form.respectCrawlDelay,
        userAgent: form.userAgent.trim() || null,
      };
      await auth.api.put(`/sites/${siteId}/crawl-config`, payload);
    },
    onSuccess: async () => {
      setError(null);
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['crawl-config', siteId] });
    },
    onError: (reason) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar');
    },
  });

  if (!config.data || !form) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex items-center gap-3">
          <Settings2 size={18} className="text-brand-500" />
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Config del crawler</h2>
        </div>
        <p className="mt-3 text-sm text-slate-500">Cargando configuración...</p>
      </article>
    );
  }

  const summary = [
    `${config.data.maxPages} páginas`,
    `profundidad ${config.data.maxDepth}`,
    `${config.data.maxConcurrentPages} en paralelo`,
    config.data.requestDelayMs > 0 ? `${config.data.requestDelayMs}ms entre peticiones` : null,
    config.data.respectCrawlDelay ? 'respeta crawl-delay' : 'ignora crawl-delay',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Settings2 size={18} className="text-brand-500" />
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Config del crawler</h2>
        </div>
        {canEdit && !editing ? (
          <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
            Editar
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Ajusta cuántas páginas y a qué velocidad se audita este sitio. Útil cuando el servidor es
        sensible a tráfico de crawler.
      </p>

      {!editing ? (
        <p className="mt-4 text-sm text-slate-700">{summary}</p>
      ) : (
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <NumberField
            label="Máx. páginas"
            hint={`hasta ${HARD_CAP.maxPages}`}
            value={form.maxPages}
            onChange={(value) => setForm({ ...form, maxPages: value })}
          />
          <NumberField
            label="Profundidad máx."
            hint={`hasta ${HARD_CAP.maxDepth}`}
            value={form.maxDepth}
            onChange={(value) => setForm({ ...form, maxDepth: value })}
          />
          <NumberField
            label="Concurrencia"
            hint={`hasta ${HARD_CAP.maxConcurrentPages} páginas en paralelo`}
            value={form.maxConcurrentPages}
            onChange={(value) => setForm({ ...form, maxConcurrentPages: value })}
          />
          <NumberField
            label="Delay entre peticiones (ms)"
            hint={`hasta ${HARD_CAP.requestDelayMs}ms`}
            value={form.requestDelayMs}
            onChange={(value) => setForm({ ...form, requestDelayMs: value })}
          />
          <label className="col-span-full flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              checked={form.respectCrawlDelay}
              onChange={(event) => setForm({ ...form, respectCrawlDelay: event.target.checked })}
            />
            Respetar{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">Crawl-delay</code> del
            robots.txt
          </label>
          <label className="col-span-full flex flex-col gap-2 text-sm text-slate-700">
            <span>
              User-Agent personalizado{' '}
              <span className="text-xs text-slate-500">(deja vacío para el por defecto)</span>
            </span>
            <TextInput
              value={form.userAgent}
              onChange={(event) => setForm({ ...form, userAgent: event.target.value })}
              placeholder="MyBot/1.0 (+https://miempresa.com/bot)"
            />
          </label>
          {error ? (
            <div className="col-span-full">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
          <div className="col-span-full flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setForm(toForm(config.data));
                setError(null);
              }}
              disabled={save.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-700">
      <span>
        {label}
        {hint ? <span className="ml-2 text-xs text-slate-500">{hint}</span> : null}
      </span>
      <TextInput
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
