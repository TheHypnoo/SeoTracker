import { Permission, Role, computeEffectivePermissions } from '@seotracker/shared-types';
import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { ChevronDown, MailPlus, Pencil, SlidersHorizontal, Trash2, Users2 } from 'lucide-react';
import { useMemo, useReducer, useState } from 'react';
import { Button } from '#/components/button';
import { ConfirmActionModal } from '#/components/confirm-action-modal';
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
import { RoleCards } from '#/components/members/role-cards';
import { RolePermissionsEditor } from '#/components/members/role-permissions-editor';
import { z } from 'zod';

import { useAuth } from '../../lib/auth-context';
import { createSubmitHandler, displayFormError } from '../../lib/forms';
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

type ProjectInvite = {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  extraPermissions: Permission[];
  revokedPermissions: Permission[];
  status: 'pending' | 'expired';
  createdAt: string;
  expiresAt: string;
};

type CreateInviteResponse = Omit<ProjectInvite, 'createdAt' | 'status'> & {
  token: string;
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
    if (action.role === state.role) return state;
    // Switching role resets permissions to that role's defaults — predictable.
    return {
      ...state,
      role: action.role,
      effective: new Set(computeEffectivePermissions(action.role)),
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
  const invites = useQuery({
    queryKey: ['project-invites', projectId],
    queryFn: () => auth.api.get<ProjectInvite[]>(`/projects/${projectId}/invites`),
    enabled: Boolean(auth.accessToken && projectId && canInvite),
  });

  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Configuración &gt; Equipo
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
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

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
              <div className="flex items-center gap-3">
                <Users2 size={18} className="text-brand-500" />
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
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

            {canInvite ? <PendingInvitesPanel projectId={projectId} invites={invites} /> : null}
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
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [effective, setEffective] = useState<Set<Permission>>(
    () => new Set(computeEffectivePermissions(Role.MEMBER)),
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Changing the role resets permissions to that role's defaults — predictable.
  const changeRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    setEffective(new Set(computeEffectivePermissions(next)));
  };

  const roleDiff = diffAgainstRoleDefaults(role, effective);
  const customCount = roleDiff.extra.length + roleDiff.revoked.length;

  const invite = useMutation({
    mutationFn: (email: string) => {
      const { extra, revoked } = diffAgainstRoleDefaults(role, effective);
      return auth.api.post<CreateInviteResponse>(`/projects/${projectId}/invites`, {
        email,
        role,
        extraPermissions: extra,
        revokedPermissions: revoked,
      });
    },
    onSuccess: async () => {
      setInviteError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['members', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-invites', projectId] }),
      ]);
    },
  });

  const inviteForm = useForm({
    defaultValues: {
      email: '',
    },
    onSubmit: async ({ value }) => {
      setInviteError(null);
      setInviteSuccess(null);
      const sentInvite = await invite.mutateAsync(value.email.trim());
      setInviteSuccess(
        `Invitación enviada a ${sentInvite.email}. Aparecerá como pendiente hasta que acepte el enlace.`,
      );
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-center gap-3">
        <MailPlus size={18} className="text-brand-500" />
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Invitar usuario</h2>
      </div>
      <form
        className="mt-6 space-y-5"
        onSubmit={createSubmitHandler(async () => {
          try {
            await inviteForm.handleSubmit();
          } catch (error) {
            setInviteSuccess(null);
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
          {(field) => {
            const fieldError = displayFormError(field);
            return (
              <div>
                <TextInput
                  placeholder="correo@empresa.com"
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {fieldError ? <p className="mt-2 text-xs text-rose-600">{fieldError}</p> : null}
              </div>
            );
          }}
        </inviteForm.Field>

        <RoleCards name="invite-role" role={role} onRoleChange={changeRole} />

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setCustomizeOpen((open) => !open)}
            aria-expanded={customizeOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
              <SlidersHorizontal size={15} className="text-slate-400" aria-hidden="true" />
              Personalizar permisos
              <span className="font-normal text-slate-400">(opcional)</span>
              {customCount > 0 ? (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  {customCount} {customCount === 1 ? 'ajuste' : 'ajustes'}
                </span>
              ) : null}
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition-transform ${customizeOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {customizeOpen ? (
            <div className="border-t border-slate-100 px-4 py-4">
              <RolePermissionsEditor
                role={role}
                onRoleChange={changeRole}
                effective={effective}
                onEffectiveChange={setEffective}
                showRoleSelector={false}
              />
            </div>
          ) : null}
        </div>

        {inviteError ? <Notice tone="danger">{inviteError}</Notice> : null}
        {inviteSuccess ? <Notice tone="success">{inviteSuccess}</Notice> : null}
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

function PendingInvitesPanel({
  projectId,
  invites,
}: {
  projectId: string;
  invites: UseQueryResult<ProjectInvite[]>;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [inviteToRevoke, setInviteToRevoke] = useState<ProjectInvite | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const revoke = useMutation({
    mutationFn: (inviteId: string) => auth.api.delete(`/projects/${projectId}/invites/${inviteId}`),
    onSuccess: async () => {
      setInviteToRevoke(null);
      setRevokeError(null);
      await queryClient.invalidateQueries({ queryKey: ['project-invites', projectId] });
    },
    onError: (error) => {
      setRevokeError(error instanceof Error ? error.message : 'No se pudo revocar la invitación');
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-center gap-3">
        <MailPlus size={18} className="text-brand-500" />
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Invitaciones enviadas</h2>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Usuarios invitados que todavía no han aceptado el enlace de acceso.
      </p>
      <div className="mt-6">
        <QueryState
          status={invites.status}
          data={invites.data}
          error={invites.error}
          onRetry={() => invites.refetch()}
          isEmpty={(list) => list.length === 0}
          loading={
            <ul className="space-y-3">
              {['i1', 'i2'].map((slot) => (
                <li key={slot} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </li>
              ))}
            </ul>
          }
          empty={
            <EmptyState
              title="Sin invitaciones pendientes"
              description="Cuando envíes una invitación, se mostrará aquí como solicitud enviada."
            />
          }
        >
          {(list) => (
            <ul className="space-y-3">
              {list.map((invite) => (
                <PendingInviteRow
                  key={invite.id}
                  invite={invite}
                  isRevoking={revoke.isPending && revoke.variables === invite.id}
                  onRevoke={() => {
                    setRevokeError(null);
                    setInviteToRevoke(invite);
                  }}
                />
              ))}
            </ul>
          )}
        </QueryState>
      </div>

      <ConfirmActionModal
        open={Boolean(inviteToRevoke)}
        onOpenChange={(open) => {
          if (revoke.isPending) return;
          if (!open) {
            setInviteToRevoke(null);
            setRevokeError(null);
          }
        }}
        title="Revocar invitación"
        description={
          inviteToRevoke
            ? `Vas a revocar la invitación enviada a ${inviteToRevoke.email}.`
            : undefined
        }
        consequences={[
          'El enlace de invitación dejará de funcionar.',
          'La persona invitada no será añadida al proyecto.',
          'Podrás enviar una nueva invitación a este correo más adelante.',
        ]}
        consequencesTitle="Al revocar esta invitación:"
        confirmLabel="Revocar invitación"
        pendingLabel="Revocando..."
        pending={revoke.isPending}
        error={revokeError}
        variant="danger"
        onConfirm={() => {
          if (inviteToRevoke) {
            revoke.mutate(inviteToRevoke.id);
          }
        }}
      />
    </div>
  );
}

function PendingInviteRow({
  invite,
  isRevoking,
  onRevoke,
}: {
  invite: ProjectInvite;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  const overrideSummary = summarizeOverrides(invite.extraPermissions, invite.revokedPermissions);
  const expired = invite.status === 'expired';

  return (
    <li className="flex items-start justify-between gap-4 rounded-2xl border border-dashed border-slate-200 px-4 py-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{invite.email}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Enviada el {formatDate(invite.createdAt)} · Caduca el {formatDate(invite.expiresAt)}
        </div>
        {overrideSummary ? (
          <div
            className="mt-1.5 text-[11px] text-slate-500"
            title={[
              ...invite.extraPermissions.map((p) => `+ ${PERMISSION_LABELS[p]}`),
              ...invite.revokedPermissions.map((p) => `− ${PERMISSION_LABELS[p]}`),
            ].join('\n')}
          >
            {overrideSummary}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
            expired ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {expired ? 'Expirada' : 'Solicitud enviada'}
        </span>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
          {ROLE_LABELS[invite.role]}
        </span>
        <button
          type="button"
          disabled={isRevoking}
          onClick={onRevoke}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 size={12} aria-hidden="true" />
          {isRevoking ? 'Revocando...' : 'Revocar'}
        </button>
      </div>
    </li>
  );
}

function summarizeOverrides(extraPermissions: Permission[], revokedPermissions: Permission[]) {
  const extras = extraPermissions.length;
  const revoked = revokedPermissions.length;
  if (extras === 0 && revoked === 0) return null;
  const parts: string[] = [];
  if (extras > 0) parts.push(`+${extras} extra`);
  if (revoked > 0) parts.push(`-${revoked} revoked`);
  return parts.join(' · ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
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

  const overrideSummary = useMemo(
    () => (isOwner ? null : summarizeOverrides(member.extraPermissions, member.revokedPermissions)),
    [isOwner, member.extraPermissions, member.revokedPermissions],
  );

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
      <div className="space-y-5">
        <RoleCards
          name={`edit-role-${member.userId}`}
          role={role}
          onRoleChange={(nextRole) => dispatch({ type: 'role', role: nextRole })}
        />
        <RolePermissionsEditor
          role={role}
          onRoleChange={(nextRole) => dispatch({ type: 'role', role: nextRole })}
          effective={effective}
          onEffectiveChange={(nextEffective) =>
            dispatch({ type: 'effective', effective: nextEffective })
          }
          showRoleSelector={false}
        />
      </div>
      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </Modal>
  );
}
