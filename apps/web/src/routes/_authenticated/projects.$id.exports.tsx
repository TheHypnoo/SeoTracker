import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { PaginatedResponse } from '@seotracker/shared-types';
import { Button } from '#/components/button';
import { EmptyState } from '#/components/empty-state';
import { Pagination } from '#/components/pagination';
import { Skeleton } from '#/components/skeleton';
import { downloadExport } from '#/components/site-detail/helpers';
import { useAuth } from '../../lib/auth-context';
import { formatDisplayDateTime } from '../../lib/date-format';
import { useToast } from '../../components/toast';

interface ProjectExportRow {
  id: string;
  kind: string;
  format: string;
  status: string;
  createdAt: string;
  fileName: string | null;
  siteId: string;
  siteName: string;
  siteDomain: string;
}

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  EXPIRED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-rose-50 text-rose-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PROCESSING: 'bg-sky-50 text-sky-700',
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completado',
  EXPIRED: 'Expirado',
  FAILED: 'Error',
  PENDING: 'En cola',
  PROCESSING: 'Generando',
};

export const Route = createFileRoute('/_authenticated/projects/$id/exports')({
  component: ProjectExportsPage,
});

function ProjectExportsPage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [offset, setOffset] = useState(0);

  const exports = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () =>
      auth.api.get<PaginatedResponse<ProjectExportRow>>(
        `/projects/${id}/exports?limit=${PAGE_SIZE}&offset=${offset}`,
      ),
    queryKey: ['project-exports', id, offset],
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasActive = items.some((it) => it.status === 'PENDING' || it.status === 'PROCESSING');
      return hasActive ? 5_000 : 30_000;
    },
  });

  const retryExport = useMutation({
    mutationFn: (exportId: string) => auth.api.post(`/exports/${exportId}/retry`),
    onError: (error) => {
      toast.error('No se pudo reintentar', String((error as Error)?.message ?? error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-exports', id] });
    },
  });

  const items = exports.data?.items ?? [];
  const total = exports.data?.total ?? 0;

  return (
    <section className="space-y-5">
      <header>
        <p className="text-sm font-medium text-slate-500">Proyecto</p>
        <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Exportaciones
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Todas las descargas generadas en el proyecto. Genera nuevas desde el detalle de cada
          dominio o auditoría.
        </p>
      </header>

      <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex justify-end border-b border-slate-100 pb-4">
          <Pagination
            total={total}
            offset={offset}
            pageSize={PAGE_SIZE}
            onChange={setOffset}
            itemLabel="exportaciones"
          />
        </div>

        {exports.isLoading ? (
          <ul className="mt-4 space-y-3">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </ul>
        ) : items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Sin exportaciones"
              description="Cuando generes un CSV desde un dominio o auditoría aparecerá aquí."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((exp) => (
              <li key={exp.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {exp.kind} · {exp.format}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[exp.status] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {STATUS_LABEL[exp.status] ?? exp.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Link
                      to="/sites/$id"
                      params={{ id: exp.siteId }}
                      className="font-medium text-slate-700 no-underline hover:text-brand-600"
                    >
                      {exp.siteName}
                    </Link>
                    <span className="font-mono">{exp.siteDomain}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDisplayDateTime(exp.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {exp.status === 'COMPLETED' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void downloadExport(auth.api, exp.id, exp.fileName)}
                    >
                      <Download size={13} aria-hidden="true" />
                      Descargar
                    </Button>
                  ) : exp.status === 'FAILED' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => retryExport.mutate(exp.id)}
                      disabled={retryExport.isPending}
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                      Reintentar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
