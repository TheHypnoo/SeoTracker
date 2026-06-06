import { Permission, Role } from '@seotracker/shared-types';
import { RotateCcw } from 'lucide-react';
import { useId, useMemo } from 'react';

import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  getRoleDefaults,
  isOwnerExclusive,
} from './permission-catalog';

type Props = {
  /**
   * Current role. OWNER is read-only here — owners always have every
   * permission and cannot have overrides.
   */
  role: Role;
  onRoleChange: (next: Role) => void;
  /** The full effective permission set the form is editing. */
  effective: ReadonlySet<Permission>;
  onEffectiveChange: (next: Set<Permission>) => void;
  /** Hide the role selector (e.g. when editing the only owner). */
  lockRole?: boolean;
  /**
   * When false, the role selector is not rendered — only the permission
   * checklist. Used by the invite flow, where the role is chosen with
   * descriptive cards above and permissions live in an optional disclosure.
   */
  showRoleSelector?: boolean;
};

/**
 * Reusable editor for role + per-user permission overrides.
 *
 * Renders the editable role buttons + a grouped checklist. The checklist is fully
 * controlled: the parent owns the `effective` set. We intentionally don't
 * track extras/revoked here — the parent computes the diff against role
 * defaults at submit time via diffAgainstRoleDefaults().
 *
 * OWNER is shown only when the current subject already is OWNER. Ownership is
 * transferred through a dedicated flow, not through invitation/member editing.
 */
export function RolePermissionsEditor({
  role,
  onRoleChange,
  effective,
  onEffectiveChange,
  lockRole = false,
  showRoleSelector = true,
}: Props) {
  const editorId = useId();
  const defaults = useMemo(() => getRoleDefaults(role), [role]);

  const setRole = (nextRole: Role) => {
    if (nextRole === role) return;
    // Reset effective to the new role's defaults — predictable, no surprises.
    onEffectiveChange(new Set(getRoleDefaults(nextRole)));
    onRoleChange(nextRole);
  };

  const togglePermission = (perm: Permission, checked: boolean) => {
    const next = new Set(effective);
    if (checked) next.add(perm);
    else next.delete(perm);
    onEffectiveChange(next);
  };

  const restoreDefaults = () => {
    onEffectiveChange(new Set(defaults));
  };

  const isOwner = role === Role.OWNER;
  const roleOptions = isOwner ? [Role.OWNER] : [Role.MEMBER, Role.VIEWER];

  return (
    <div className="space-y-5">
      {showRoleSelector ? (
        <fieldset disabled={lockRole}>
          <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Rol
          </legend>
          <div
            className={`mt-3 grid gap-2 ${roleOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
          >
            {roleOptions.map((value) => {
              const selected = role === value;
              const roleInputId = `${editorId}-role-${value}`;
              return (
                <label
                  key={value}
                  htmlFor={roleInputId}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm font-semibold transition ${
                    selected
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    id={roleInputId}
                    className="sr-only"
                    name={`${editorId}-member-role`}
                    value={value}
                    checked={selected}
                    onChange={() => setRole(value)}
                  />
                  {ROLE_LABELS[value]}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {role === Role.OWNER
              ? 'Owner siempre tiene todos los permisos. No se puede personalizar.'
              : 'Marca o desmarca permisos para ajustar lo que este miembro puede hacer.'}
          </p>
        </fieldset>
      ) : null}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Permisos
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-normal text-slate-500 normal-case">
              {effective.size} activos
            </span>
          </h4>
          {!isOwner ? (
            <button
              type="button"
              onClick={restoreDefaults}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Restablecer permisos del rol
            </button>
          ) : null}
        </div>
        {PERMISSION_GROUPS.map((group) => {
          const visible = group.permissions.filter((perm) => isOwner || !isOwnerExclusive(perm));
          if (visible.length === 0) return null;
          return (
            <div key={group.title} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {group.title}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {visible.map((perm) => {
                  const ownerOnly = isOwnerExclusive(perm);
                  const checked = effective.has(perm);
                  const disabled = isOwner || ownerOnly;
                  const isDefault = defaults.has(perm);
                  // Only surface a chip when the choice deviates from the role
                  // default — that's the meaningful signal, not "default" noise.
                  const deviation = isOwner
                    ? null
                    : checked && !isDefault
                      ? 'added'
                      : !checked && isDefault
                        ? 'removed'
                        : null;
                  const permissionInputId = `${editorId}-permission-${perm}`;
                  return (
                    <li key={perm}>
                      <label
                        htmlFor={permissionInputId}
                        title={perm}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                          disabled ? 'cursor-not-allowed' : ''
                        } ${
                          checked
                            ? 'border-brand-200 bg-brand-50/50'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={permissionInputId}
                          aria-label={PERMISSION_LABELS[perm]}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => togglePermission(perm, event.target.checked)}
                        />
                        <span
                          className={`flex-1 font-medium ${checked ? 'text-slate-900' : 'text-slate-600'}`}
                        >
                          {PERMISSION_LABELS[perm]}
                        </span>
                        {deviation === 'added' ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            Extra
                          </span>
                        ) : deviation === 'removed' ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Quitada
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
