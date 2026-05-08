import { Permission } from '@seotracker/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/button';
import { Notice } from '#/components/notice';
import { useToast } from '#/components/toast';

import { useAuth } from '../../lib/auth-context';
import { usePermissions } from '../../lib/use-permissions';

type BadgeStatus = { enabled: boolean };

/**
 * Public-badge opt-in card on the site detail page. When enabled, shows a
 * live preview plus copy-ready snippets for Markdown / HTML / direct URL.
 * Edit gated on SCHEDULE_WRITE — same audience that controls crawl config.
 */
export function PublicBadgeCard({ siteId, projectId }: { siteId: string; projectId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const authz = usePermissions(projectId);
  const canEdit = authz.can(Permission.SCHEDULE_WRITE);

  const status = useQuery<BadgeStatus>({
    queryKey: ['public-badge', siteId],
    queryFn: () => auth.api.get<BadgeStatus>(`/sites/${siteId}/public-badge`),
    enabled: Boolean(auth.accessToken && siteId),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => auth.api.put(`/sites/${siteId}/public-badge`, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['public-badge', siteId] });
    },
    onError: (reason) => {
      toast.error(
        'No se pudo guardar',
        reason instanceof Error ? reason.message : 'Inténtalo de nuevo en un momento.',
      );
    },
  });

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const apiBase = import.meta.env.VITE_API_URL ?? '/api/v1';
  const publicApiBase =
    import.meta.env.VITE_PUBLIC_API_URL ??
    (import.meta.env.DEV && apiBase.startsWith('/') ? 'http://localhost:4000/api/v1' : apiBase);
  const badgePath = `/public/sites/${siteId}/badge.svg`;
  const badgeUrl = publicApiBase.startsWith('http')
    ? `${publicApiBase}${badgePath}`
    : `${origin}${publicApiBase}${badgePath}`;
  const previewUrl = `${badgeUrl}?preview=${status.dataUpdatedAt}`;
  const markdown = `[![SEOTracker score](${badgeUrl})](${origin})`;
  const html = `<a href="${origin}"><img src="${badgeUrl}" alt="SEOTracker score" /></a>`;

  const enabled = status.data?.enabled ?? false;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Share2 size={18} className="text-brand-500" />
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Badge público</h2>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant={enabled ? 'ghost' : 'primary'}
            disabled={toggle.isPending || status.isLoading}
            onClick={() => toggle.mutate(!enabled)}
          >
            {toggle.isPending ? 'Guardando...' : enabled ? 'Desactivar' : 'Activar'}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Embebe el último score SEO de este sitio en tu web o compártelo como una imagen pública.
      </p>

      {status.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando estado…</p>
      ) : enabled ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <img
              src={previewUrl}
              alt="Vista previa del badge SEOTracker"
              width={168}
              height={28}
              className="shrink-0"
            />
            <span className="text-xs text-slate-500">Vista previa en vivo</span>
          </div>
          <SnippetRow label="Markdown" value={markdown} onCopy={() => copy(markdown, toast)} />
          <SnippetRow label="HTML" value={html} onCopy={() => copy(html, toast)} />
          <SnippetRow label="URL del SVG" value={badgeUrl} onCopy={() => copy(badgeUrl, toast)} />
        </div>
      ) : (
        <div className="mt-4">
          <Notice tone="neutral">
            El badge está desactivado. Cuando lo actives, cualquier persona con la URL podrá
            embeberlo (recomendado para landing pages).
          </Notice>
        </div>
      )}
    </article>
  );
}

function SnippetRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-700">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {value}
        </code>
        <button
          type="button"
          aria-label={`Copiar ${label}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
          onClick={() => {
            onCopy();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <>
              <Check size={14} aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden="true" />
              Copiar
            </>
          )}
        </button>
      </div>
    </label>
  );
}

function copy(text: string, toast: ReturnType<typeof useToast>) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success('Copiado', 'El snippet está en tu portapapeles.'))
    .catch(() => toast.error('No se pudo copiar', 'Permiso denegado por el navegador.'));
}
