import { useForm } from '@tanstack/react-form';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu as BaseMenu } from '@base-ui/react';
import { Mail, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/button';
import { ConfirmDeleteModal } from '#/components/confirm-delete-modal';
import { EmptyState } from '#/components/empty-state';
import { Modal } from '#/components/modal';
import { Notice } from '#/components/notice';
import { Skeleton } from '#/components/skeleton';
import { SwitchField } from '#/components/switch-field';
import { TextInput } from '#/components/text-input';
import { useAuth } from '../../lib/auth-context';
import { firstFormError, useFormSubmitHandler } from '../../lib/forms';
import { useProject } from '../../lib/project-context';

interface SiteListItem {
  id: string;
  name: string;
  domain: string;
  active: boolean;
  projectId: string;
}

interface Preferences {
  userId: string;
  activeProjectId: string | null;
  emailOnAuditCompleted: boolean;
  emailOnAuditRegression: boolean;
  emailOnCriticalIssues: boolean;
}

export const Route = createFileRoute('/_authenticated/settings/general')({
  component: GeneralSettingsPage,
});

function useGeneralSettingsUiState() {
  return {
    renameOpenState: useState(false),
    renameErrorState: useState<string | null>(null),
    deleteProjectOpenState: useState(false),
    deleteProjectErrorState: useState<string | null>(null),
    siteRenameTargetState: useState<SiteListItem | null>(null),
    siteRenameErrorState: useState<string | null>(null),
    siteDeleteTargetState: useState<SiteListItem | null>(null),
    siteDeleteErrorState: useState<string | null>(null),
  };
}

function GeneralSettingsPage() {
  const auth = useAuth();
  const project = useProject();
  const projectId = project.activeProjectId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const goToDashboard = navigate;

  const {
    renameOpenState,
    renameErrorState,
    deleteProjectOpenState,
    deleteProjectErrorState,
    siteRenameTargetState,
    siteRenameErrorState,
    siteDeleteTargetState,
    siteDeleteErrorState,
  } = useGeneralSettingsUiState();
  const [renameOpen, setRenameOpen] = renameOpenState;
  const [renameError, setRenameError] = renameErrorState;
  const [deleteProjectOpen, setDeleteProjectOpen] = deleteProjectOpenState;
  const [deleteProjectError, setDeleteProjectError] = deleteProjectErrorState;
  const [siteRenameTarget, setSiteRenameTarget] = siteRenameTargetState;
  const [siteRenameError, setSiteRenameError] = siteRenameErrorState;
  const [siteDeleteTarget, setSiteDeleteTarget] = siteDeleteTargetState;
  const [siteDeleteError, setSiteDeleteError] = siteDeleteErrorState;

  const sites = useQuery({
    enabled: Boolean(auth.user && projectId),
    queryFn: () =>
      auth.api.get<{ items: SiteListItem[]; total: number }>(
        `/sites?projectId=${projectId}&limit=100&offset=0`,
      ),
    queryKey: ['sites-list', projectId],
  });

  const preferences = useQuery({
    enabled: Boolean(auth.user),
    queryFn: () => auth.api.get<Preferences>('/users/preferences'),
    queryKey: ['user-preferences', auth.user?.id],
  });

  const updateEmailPreferences = useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      auth.api.patch<Preferences>('/users/preferences', patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-preferences', auth.user?.id] });
    },
  });

  const renameProject = useMutation({
    mutationFn: (name: string) =>
      auth.api.patch<{ id: string; name: string }>(`/projects/${projectId}`, { name }),
    onError: (error) => {
      setRenameError(error instanceof Error ? error.message : 'No se pudo renombrar');
    },
    onSuccess: async () => {
      setRenameError(null);
      setRenameOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] }),
        project.refresh(),
      ]);
    },
  });

  const renameForm = useForm({
    defaultValues: { name: project.activeProject?.name ?? '' },
    onSubmit: async ({ value }) => {
      setRenameError(null);
      await renameProject.mutateAsync(value.name.trim());
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => auth.api.delete(`/projects/${projectId}`),
    onError: (error) => {
      setDeleteProjectError(error instanceof Error ? error.message : 'No se pudo eliminar');
    },
    onSuccess: async () => {
      setDeleteProjectError(null);
      setDeleteProjectOpen(false);
      queryClient.removeQueries({ queryKey: ['project', projectId] });
      queryClient.removeQueries({ queryKey: ['sites-list', projectId] });
      queryClient.removeQueries({ queryKey: ['sites', projectId] });
      queryClient.removeQueries({ queryKey: ['project-dashboard', projectId] });
      await project.refresh();
      goToDashboard({ to: '/dashboard' });
    },
  });

  const renameSite = useMutation({
    mutationFn: (args: { id: string; name: string }) =>
      auth.api.patch(`/sites/${args.id}`, { name: args.name }),
    onError: (error) => {
      setSiteRenameError(error instanceof Error ? error.message : 'No se pudo renombrar');
    },
    onSuccess: async () => {
      setSiteRenameError(null);
      setSiteRenameTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['sites-list', projectId] });
    },
  });

  const siteRenameForm = useForm({
    defaultValues: { name: siteRenameTarget?.name ?? '' },
    onSubmit: async ({ value }) => {
      if (!siteRenameTarget) return;
      setSiteRenameError(null);
      await renameSite.mutateAsync({ id: siteRenameTarget.id, name: value.name.trim() });
    },
  });
  const handleRenameProjectSubmit = useFormSubmitHandler(async () => {
    try {
      await renameForm.handleSubmit();
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'No se pudo renombrar');
    }
  });
  const handleRenameSiteSubmit = useFormSubmitHandler(async () => {
    try {
      await siteRenameForm.handleSubmit();
    } catch (error) {
      setSiteRenameError(error instanceof Error ? error.message : 'No se pudo renombrar');
    }
  });

  const deleteSite = useMutation({
    mutationFn: (id: string) => auth.api.delete(`/sites/${id}`),
    onError: (error) => {
      setSiteDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar');
    },
    onSuccess: async () => {
      setSiteDeleteError(null);
      setSiteDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['sites-list', projectId] });
    },
  });

  if (!projectId) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200/70">
        <EmptyState
          title="Selecciona un proyecto"
          description="Necesitas un proyecto activo para gestionar sus ajustes."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Configuración &gt; General
        </div>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Ajustes generales
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          Gestiona el proyecto activo, sus dominios y tus preferencias de notificación.
        </p>
      </header>

      {/* Project section */}
      <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-900">Proyecto</h2>
        <p className="mt-1 text-sm text-slate-500">
          Información del proyecto activo. Solo el owner puede modificarlo.
        </p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr]">
          <dt className="text-sm font-medium text-slate-500">Nombre</dt>
          <dd className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-900">{project.activeProject?.name ?? '—'}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRenameOpen(true)}>
              <Pencil size={13} aria-hidden="true" />
              Renombrar
            </Button>
          </dd>
        </dl>

        <div className="mt-8 border-t border-rose-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-rose-700">Eliminar proyecto</h3>
              <p className="mt-1 max-w-prose text-sm text-slate-600">
                Borra el proyecto y todos sus dominios, auditorías, alertas e integraciones. No se
                puede deshacer.
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setDeleteProjectOpen(true)}
            >
              <Trash2 size={13} aria-hidden="true" />
              Eliminar
            </Button>
          </div>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-950 p-2 text-white">
            <Mail size={17} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Notificaciones por email</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-500">
              Controla qué avisos transaccionales quieres recibir por correo. Las notificaciones
              dentro de la app se siguen creando siempre.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {preferences.isLoading ? (
            <>
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </>
          ) : (
            <>
              <SwitchField
                label="Auditorías completadas"
                description="Recibir un resumen cuando termine una auditoría de cualquier dominio del proyecto."
                checked={preferences.data?.emailOnAuditCompleted ?? true}
                disabled={updateEmailPreferences.isPending}
                onCheckedChange={(checked) =>
                  updateEmailPreferences.mutate({ emailOnAuditCompleted: checked })
                }
              />
              <SwitchField
                label="Regresiones SEO"
                description="Recibir alertas cuando el score baje o aparezcan señales de regresión."
                checked={preferences.data?.emailOnAuditRegression ?? true}
                disabled={updateEmailPreferences.isPending}
                onCheckedChange={(checked) =>
                  updateEmailPreferences.mutate({ emailOnAuditRegression: checked })
                }
              />
              <SwitchField
                label="Incidencias críticas"
                description="Recibir correos cuando se detecten nuevas incidencias críticas."
                checked={preferences.data?.emailOnCriticalIssues ?? true}
                disabled={updateEmailPreferences.isPending}
                onCheckedChange={(checked) =>
                  updateEmailPreferences.mutate({ emailOnCriticalIssues: checked })
                }
              />
            </>
          )}
        </div>
      </article>

      {/* Sites section */}
      <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Dominios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Renombra o elimina dominios del proyecto activo.
            </p>
          </div>
          <Link
            to="/projects/$id/sites"
            params={{ id: projectId }}
            className="text-sm font-medium text-brand-600 no-underline hover:text-brand-700"
          >
            Ver listado completo
          </Link>
        </div>

        <div className="mt-5">
          {sites.isLoading ? (
            <ul className="space-y-2">
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </ul>
          ) : !sites.data || sites.data.items.length === 0 ? (
            <EmptyState
              title="Sin dominios"
              description="Añade un dominio para empezar a gestionarlo desde aquí."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sites.data.items.map((site) => (
                <li
                  key={site.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{site.name}</p>
                    <p className="truncate font-mono text-xs text-slate-500">{site.domain}</p>
                  </div>
                  <SiteActionsMenu
                    onRename={() => setSiteRenameTarget(site)}
                    onDelete={() => setSiteDeleteTarget(site)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      {/* Rename project modal */}
      <Modal
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Renombrar proyecto"
        description="Cambia el nombre que ven los miembros del equipo."
      >
        <form className="space-y-3" onSubmit={handleRenameProjectSubmit}>
          <renameForm.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? 'El nombre es obligatorio'
                  : value.trim().length < 2
                    ? 'Debe tener al menos 2 caracteres'
                    : undefined,
            }}
          >
            {(field) => (
              <div>
                <label htmlFor="rename-project-name" className="text-sm font-medium text-slate-700">
                  Nombre del proyecto
                </label>
                <TextInput
                  id="rename-project-name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  invalid={Boolean(firstFormError(field.state.meta.errors))}
                  className="mt-1.5"
                />
                {firstFormError(field.state.meta.errors) ? (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {firstFormError(field.state.meta.errors)}
                  </p>
                ) : null}
              </div>
            )}
          </renameForm.Field>
          {renameError ? <Notice tone="danger">{renameError}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <renameForm.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit} loading={Boolean(isSubmitting)}>
                  Guardar
                </Button>
              )}
            </renameForm.Subscribe>
          </div>
        </form>
      </Modal>

      {/* Delete project confirm */}
      <ConfirmDeleteModal
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        resourceName={project.activeProject?.name ?? ''}
        resourceLabel="proyecto"
        consequences={[
          'Todos los dominios del proyecto',
          'Histórico de auditorías y comparativas',
          'Reglas de alerta y schedules',
          'Webhooks y exportaciones',
        ]}
        pending={deleteProject.isPending}
        error={deleteProjectError}
        onConfirm={() => deleteProject.mutate()}
      />

      {/* Rename site modal */}
      <Modal
        open={Boolean(siteRenameTarget)}
        onOpenChange={(next) => {
          if (!next) {
            setSiteRenameTarget(null);
            setSiteRenameError(null);
          }
        }}
        title="Renombrar dominio"
        description={siteRenameTarget?.domain}
      >
        {siteRenameTarget ? (
          <form className="space-y-3" onSubmit={handleRenameSiteSubmit}>
            <siteRenameForm.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  !value.trim()
                    ? 'El nombre es obligatorio'
                    : value.trim().length < 2
                      ? 'Debe tener al menos 2 caracteres'
                      : undefined,
              }}
            >
              {(field) => (
                <div>
                  <label htmlFor="rename-site-name" className="text-sm font-medium text-slate-700">
                    Nombre
                  </label>
                  <TextInput
                    id="rename-site-name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    invalid={Boolean(firstFormError(field.state.meta.errors))}
                    className="mt-1.5"
                  />
                  {firstFormError(field.state.meta.errors) ? (
                    <p role="alert" className="mt-1 text-xs text-rose-600">
                      {firstFormError(field.state.meta.errors)}
                    </p>
                  ) : null}
                </div>
              )}
            </siteRenameForm.Field>
            {siteRenameError ? <Notice tone="danger">{siteRenameError}</Notice> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSiteRenameTarget(null)}>
                Cancelar
              </Button>
              <siteRenameForm.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <Button type="submit" disabled={!canSubmit} loading={Boolean(isSubmitting)}>
                    Guardar
                  </Button>
                )}
              </siteRenameForm.Subscribe>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Delete site confirm */}
      <ConfirmDeleteModal
        open={Boolean(siteDeleteTarget)}
        onOpenChange={(next) => {
          if (!next) {
            setSiteDeleteTarget(null);
            setSiteDeleteError(null);
          }
        }}
        resourceName={siteDeleteTarget?.name ?? ''}
        resourceLabel="dominio"
        consequences={[
          'Histórico de auditorías del dominio',
          'Comparativas y exportaciones asociadas',
          'Reglas de alerta y schedule del dominio',
        ]}
        pending={deleteSite.isPending}
        error={siteDeleteError}
        onConfirm={() => siteDeleteTarget && deleteSite.mutate(siteDeleteTarget.id)}
      />
    </section>
  );
}

function SiteActionsMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label="Acciones del dominio"
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={6} align="end" className="z-50">
          <BaseMenu.Popup className="min-w-[10rem] rounded-lg border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <BaseMenu.Item
              onClick={onRename}
              className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-900"
            >
              <Pencil size={14} aria-hidden="true" />
              Renombrar
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={onDelete}
              className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-700 outline-none transition data-[highlighted]:bg-rose-50"
            >
              <Trash2 size={14} aria-hidden="true" />
              Eliminar
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
