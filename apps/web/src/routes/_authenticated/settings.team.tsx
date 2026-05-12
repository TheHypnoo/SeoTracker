import { Permission, Role, computeEffectivePermissions } from '@seotracker/shared-types';
import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Pencil, Trash2, Users2 } from 'lucide-react';
import { useMemo, useReducer, useState } from 'react';
import { Button } from '#/components/button';
import { EmptyState } from '#/components/empty-state';
import { Modal } from '#/components/modal';
import { Notice } from '#/components/notice';
import { QueryState } from '#/components/query-state';
import { Skeleton } from '#/components/skeleton';
import { TextInput } from '#/components/text-input';
import {
  PERMISSION_LABELS,
  ROLE_LABELS,
  diffAgainstRoleDefaults,
} from '#/components/members/permission-catalog';
import { RolePermissionsEditor } from '#/components/members/role-permissions-editor';
import { z } from 'zod';

import { useAuth } from '../../lib/auth-context';
import { createSubmitHandler, firstFormError } from '../../lib/forms';
import { useProject } from '../../lib/project-context';
import { usePermissions } from '../../lib/use-permissions';

const searchSchema = z.object({
  projectId: z.string().optional(),
});

type Member = {
  userId: string;
  role: Role;
  extraPermissions: Permission[];
  revokedPermissions: Permission[];
  effectivePermissions: Permission[];
  createdAt: string;
  email: string;
  name: string;
};

type EditMemberState = {
  role: Role;
  effective: Set<Permission>;
  error: string | null;
};

type EditMemberAction =
  | { type: 'role'; role: Role }
  | { type: 'effective'; effective: Set<Permission> }
  | { type: 'error'; error: string | null };

function initEditMemberState(member: Member): EditMemberState {
  return {
    role: member.role,
    effective: new Set(member.effectivePermissions),
    error: null,
  };
}

function editMemberReducer(state: EditMemberState, action: EditMemberAction): EditMemberState {
  if (action.type === 'role') {
    return {
      ...state,
      role: action.role,
      effective: new Set(action.role === state.role ? state.effective : state.effective),
    };
  }
  if (action.type === 'effective') {
    return { ...state, effective: action.effective };
  }
  return { ...state, error: action.error };
}

export const Route = createFileRoute('/_authenticated/settings/team')({
  validateSearch: (search) => searchSchema.parse(search),
  component: TeamSettingsPage,
});

function TeamSettingsPage() {
  const auth = useAuth();
  const project = useProject();
  const search = Route.useSearch();
  const projectId = search.projectId ?? project.activeProjectId;
  const queryClient = useQueryClient();
  const authz = usePermissions(projectId);
  const canInvite = authz.can(Permission.MEMBERS_INVITE);
  const canRemove = authz.can(Permission.MEMBERS_REMOVE);

  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => auth.api.get<Member[]>(`/projects/${projectId}/members`),
    enabled: Boolean(auth.accessToken && projectId),
  });

  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Configuración &gt; Equipo
        </div>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Miembros del proyecto
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {project.activeProject?.name ?? 'Selecciona un proyecto activo para continuar.'}
        </p>
      </div>

      {projectId ? (
        <article className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {canInvite ? (
            <InvitePanel projectId={projectId} queryClient={queryClient} />
          ) : (
            <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              No tienes permiso para invitar miembros en este proyecto.
            </article>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="flex items-center gap-3">
              <Users2 size={18} className="text-brand-500" />
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                Miembros actuales
              </h2>
            </div>
            <div className="mt-6">
              <QueryState
                status={members.status}
                data={members.data}
                error={members.error}
                onRetry={() => members.refetch()}
                isEmpty={(list) => list.length === 0}
                loading={
                  <ul className="space-y-3">
                    {['m1', 'm2', 'm3'].map((slot) => (
                      <li key={slot} className="rounded-2xl border border-slate-200 px-4 py-4">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="mt-2 h-3 w-1/4" />
                      </li>
                    ))}
                  </ul>
                }
                empty={
                  <EmptyState
                    title="Sin miembros"
                    description="Invita a alguien con el formulario de la izquierda para empezar."
                  />
                }
              >
                {(list) => (
                  <ul className="space-y-3">
                    {list.map((member) => (
                      <MemberRow
                        key={member.userId}
                        projectId={projectId}
                        member={member}
                        canEdit={canInvite}
                        canRemove={canRemove}
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

function InvitePanel({
  projectId,
  queryClient,
}: {
  projectId: string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const auth = useAuth();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [effective, setEffective] = useState<Set<Permission>>(
    () => new Set(computeEffectivePermissions(Role.MEMBER)),
  );

  const invite = useMutation({
    mutationFn: (email: string) => {
      const { extra, revoked } = diffAgainstRoleDefaults(role, effective);
      return auth.api.post(`/projects/${projectId}/invites`, {
        email,
        role,
        extraPermissions: extra,
        revokedPermissions: revoked,
      });
    },
    onSuccess: async () => {
      setInviteError(null);
      await queryClient.invalidateQueries({ queryKey: ['members', projectId] });
    },
  });

  const inviteForm = useForm({
    defaultValues: {
      email: '',
    },
    onSubmit: async ({ value }) => {
      setInviteError(null);
      await invite.mutateAsync(value.email.trim());
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-center gap-3">
        <MailPlus size={18} className="text-brand-500" />
        <h2 className="text-2xl font-black tracking-tight text-slate-950">Invitar usuario</h2>
      </div>
      <form
        className="mt-6 space-y-5"
        onSubmit={createSubmitHandler(async () => {
          try {
            await inviteForm.handleSubmit();
          } catch (error) {
            setInviteError(
              error instanceof Error ? error.message : 'No se pudo enviar la invitación',
            );
          }
        })}
      >
        <inviteForm.Field
          name="email"
          validators={{
            onChange: ({ value }) => {
              if (!value) return 'El correo es obligatorio';
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Introduce un correo válido';
              return undefined;
            },
          }}
        >
          {(field) => (
            <div>
              <TextInput
                placeholder="correo@empresa.com"
                type="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {firstFormError(field.state.meta.errors) ? (
                <p className="mt-2 text-xs text-rose-600">
                  {firstFormError(field.state.meta.errors)}
                </p>
              ) : null}
            </div>
          )}
        </inviteForm.Field>

        <RolePermissionsEditor
          role={role}
          onRoleChange={setRole}
          effective={effective}
          onEffectiveChange={setEffective}
        />

        {inviteError ? <Notice tone="danger">{inviteError}</Notice> : null}
        <inviteForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Enviando...' : 'Enviar invitación'}
            </Button>
          )}
        </inviteForm.Subscribe>
      </form>
    </div>
  );
}

function MemberRow({
  projectId,
  member,
  canEdit,
  canRemove,
}: {
  projectId: string;
  member: Member;
  canEdit: boolean;
  canRemove: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const isOwner = member.role === Role.OWNER;

  const remove = useMutation({
    mutationFn: () => auth.api.delete(`/projects/${projectId}/members/${member.userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', projectId] }),
  });

  const overrideSummary = useMemo(() => {
    if (isOwner) return null;
    const extras = member.extraPermissions.length;
    const revoked = member.revokedPermissions.length;
    if (extras === 0 && revoked === 0) return null;
    const parts: string[] = [];
    if (extras > 0) parts.push(`+${extras} extra`);
    if (revoked > 0) parts.push(`-${revoked} revoked`);
    return parts.join(' · ');
  }, [isOwner, member.extraPermissions.length, member.revokedPermissions.length]);

  return (
    <li className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{member.name}</div>
        <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{member.email}</div>
        {overrideSummary ? (
          <div
            className="mt-1.5 text-[11px] text-slate-500"
            title={[
              ...member.extraPermissions.map((p) => `+ ${PERMISSION_LABELS[p]}`),
              ...member.revokedPermissions.map((p) => `− ${PERMISSION_LABELS[p]}`),
            ].join('\n')}
          >
            {overrideSummary}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
          {ROLE_LABELS[member.role]}
        </span>
        {canEdit && !isOwner ? (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            aria-label={`Editar permisos de ${member.name}`}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={14} />
          </button>
        ) : null}
        {canRemove && !isOwner ? (
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label={`Expulsar a ${member.name}`}
            className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      {editorOpen ? (
        <EditMemberPermissionsModal
          projectId={projectId}
          member={member}
          onClose={() => setEditorOpen(false)}
          onSaved={async () => {
            setEditorOpen(false);
            await queryClient.invalidateQueries({ queryKey: ['members', projectId] });
          }}
        />
      ) : null}
    </li>
  );
}

function EditMemberPermissionsModal({
  projectId,
  member,
  onClose,
  onSaved,
}: {
  projectId: string;
  member: Member;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(editMemberReducer, member, initEditMemberState);
  const { role, effective, error } = state;

  const save = useMutation({
    mutationFn: async () => {
      const { extra, revoked } = diffAgainstRoleDefaults(role, effective);
      await auth.api.patch(`/projects/${projectId}/members/${member.userId}/permissions`, {
        role,
        extraPermissions: extra,
        revokedPermissions: revoked,
      });
    },
    onSuccess: async () => {
      dispatch({ type: 'error', error: null });
      await queryClient.invalidateQueries({ queryKey: ['members', projectId] });
      await onSaved();
    },
    onError: (reason) => {
      dispatch({
        type: 'error',
        error: reason instanceof Error ? reason.message : 'No se pudo guardar',
      });
    },
  });

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Permisos de ${member.name}`}
      description={
        <>
          Cambia el rol o ajusta los permisos individuales. Cambiar de rol resetea los permisos a
          los defaults del nuevo rol.
        </>
      }
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      }
    >
      <RolePermissionsEditor
        role={role}
        onRoleChange={(nextRole) => dispatch({ type: 'role', role: nextRole })}
        effective={effective}
        onEffectiveChange={(nextEffective) =>
          dispatch({ type: 'effective', effective: nextEffective })
        }
      />
      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </Modal>
  );
}
