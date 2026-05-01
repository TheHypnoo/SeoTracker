import { Permission, Role } from '@seotracker/shared-types';
import { useMemo } from 'react';

import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  computeEffectivePermissions,
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
};

/**
 * Reusable editor for role + per-user permission overrides.
 *
 * Renders 3 role radio buttons + a grouped checklist. The checklist is fully
 * controlled: the parent owns the `effective` set. We intentionally don't
 * track extras/revoked here — the parent computes the diff against role
 * defaults at submit time via diffAgainstRoleDefaults().
 *
 * Owner-exclusive permissions are still rendered for OWNER (informational —
 * checked, disabled), and hidden for MEMBER/VIEWER (cannot be granted).
 */
export function RolePermissionsEditor({
  role,
  onRoleChange,
  effective,
  onEffectiveChange,
  lockRole = false,
}: Props) {
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

  return (
    <div className="space-y-5">
      <fieldset disabled={lockRole}>
        <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Rol
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(Object.values(Role) as Role[]).map((value) => {
            const selected = role === value;
            return (
              <label
                key={value}
                className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm font-semibold transition ${
                  selected
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="member-role"
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

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Permisos
          </h4>
          {!isOwner ? (
            <button
              type="button"
              onClick={restoreDefaults}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Restablecer a defaults del rol
            </button>
          ) : null}
        </div>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {group.title}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.permissions.map((perm) => {
                const ownerOnly = isOwnerExclusive(perm);
                // For non-owner roles, hide owner-exclusive permissions entirely.
                if (!isOwner && ownerOnly) return null;
                const checked = effective.has(perm);
                const disabled = isOwner || ownerOnly;
                const isDefault = defaults.has(perm);
                return (
                  <li key={perm}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => togglePermission(perm, event.target.checked)}
                      />
                      <span className="flex-1">
                        <span className="block text-slate-900">{PERMISSION_LABELS[perm]}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          {perm}
                          {isDefault ? ' · default' : ' · extra'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export { computeEffectivePermissions };
