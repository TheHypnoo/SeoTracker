import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook } from 'lucide-react';

import { EmptyState } from '#/components/empty-state';
import {
  CreateWebhookForm,
  type CreateWebhookInput,
} from '#/components/integrations/create-webhook-form';
import type { OutboundWebhook } from '#/components/integrations/integrations-types';
import { WebhookCard } from '#/components/integrations/webhook-card';
import { QueryState } from '#/components/query-state';
import { Skeleton } from '#/components/skeleton';

import { useAuth } from '../../lib/auth-context';
import { useProject } from '../../lib/project-context';

export const Route = createFileRoute('/_authenticated/settings/integrations')({
  component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
  const auth = useAuth();
  const project = useProject();
  const queryClient = useQueryClient();

  const projectId = project.activeProjectId;
  const basePath = `/projects/${projectId}/outbound-webhooks`;
  const listKey = ['outbound-webhooks', projectId] as const;

  const webhooks = useQuery({
    queryKey: listKey,
    queryFn: () => auth.api.get<OutboundWebhook[]>(basePath),
    enabled: Boolean(auth.accessToken && projectId),
  });

  const createWebhook = useMutation({
    mutationFn: (input: CreateWebhookInput) =>
      auth.api.post<OutboundWebhook>(basePath, {
        name: input.name,
        url: input.url,
        headerName: input.headerName || undefined,
        headerValue: input.headerValue || undefined,
        events: input.events,
        enabled: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const toggleWebhook = useMutation({
    mutationFn: (hook: OutboundWebhook) =>
      auth.api.patch(`${basePath}/${hook.id}`, { enabled: !hook.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const updateEvents = useMutation({
    mutationFn: (args: { id: string; events: string[] }) =>
      auth.api.patch(`${basePath}/${args.id}`, { events: args.events }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => auth.api.delete(`${basePath}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Configuración &gt; Integraciones
        </div>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Integraciones salientes
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Añade la URL donde quieres recibir los eventos y, si tu destino lo necesita, un header de
          autenticación. SEOTracker enviará los datos automáticamente cuando ocurra cada evento
          seleccionado.
        </p>
      </div>

      {projectId ? (
        <article className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <CreateWebhookForm
            onCreate={async (input) => {
              await createWebhook.mutateAsync(input);
            }}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="flex items-center gap-3">
              <Webhook size={18} className="text-brand-500" />
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                Integraciones configuradas
              </h2>
            </div>
            <div className="mt-6">
              <QueryState
                status={webhooks.status}
                data={webhooks.data}
                error={webhooks.error}
                onRetry={() => webhooks.refetch()}
                isEmpty={(list) => list.length === 0}
                loading={
                  <ul className="space-y-4">
                    {['o1', 'o2'].map((slot) => (
                      <li key={slot} className="rounded-2xl border border-slate-200 px-5 py-4">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="mt-2 h-3 w-2/3" />
                        <Skeleton className="mt-3 h-3 w-1/2" />
                      </li>
                    ))}
                  </ul>
                }
                empty={
                  <EmptyState
                    title="Sin integraciones"
                    description="Añade tu primera integración saliente con el formulario."
                  />
                }
              >
                {(list) => (
                  <ul className="space-y-4">
                    {list.map((hook) => (
                      <WebhookCard
                        key={hook.id}
                        webhook={hook}
                        basePath={basePath}
                        onToggle={() => toggleWebhook.mutate(hook)}
                        onDelete={() => {
                          if (confirm(`¿Eliminar "${hook.name}"?`)) {
                            deleteWebhook.mutate(hook.id);
                          }
                        }}
                        onEventsChange={(events) => updateEvents.mutate({ id: hook.id, events })}
                        onRotated={() => queryClient.invalidateQueries({ queryKey: listKey })}
                      />
                    ))}
                  </ul>
                )}
              </QueryState>
            </div>
          </div>
        </article>
      ) : (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No hay un proyecto activo seleccionado.
        </article>
      )}
    </section>
  );
}
