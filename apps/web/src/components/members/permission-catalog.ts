import {
  GRANTABLE_PERMISSIONS,
  OWNER_EXCLUSIVE_PERMISSIONS,
  Permission,
  ROLE_PERMISSIONS,
  Role,
  computeEffectivePermissions,
} from '@seotracker/shared-types';

/** Human-readable label per permission. Re-exported in Spanish for the UI. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.PROJECT_VIEW]: 'Ver proyecto',
  [Permission.PROJECT_DELETE]: 'Eliminar proyecto',
  [Permission.MEMBERS_READ]: 'Ver miembros',
  [Permission.MEMBERS_INVITE]: 'Invitar miembros',
  [Permission.MEMBERS_REMOVE]: 'Expulsar miembros',
  [Permission.SITE_READ]: 'Ver sitios',
  [Permission.SITE_WRITE]: 'Crear / editar sitios',
  [Permission.SITE_DELETE]: 'Eliminar sitios',
  [Permission.AUDIT_READ]: 'Ver auditorías',
  [Permission.AUDIT_RUN]: 'Lanzar auditorías',
  [Permission.ISSUE_UPDATE]: 'Marcar issues',
  [Permission.EXPORT_READ]: 'Ver exportaciones',
  [Permission.EXPORT_CREATE]: 'Crear exportaciones',
  [Permission.ALERT_READ]: 'Ver alertas',
  [Permission.ALERT_WRITE]: 'Configurar alertas',
  [Permission.SCHEDULE_READ]: 'Ver schedule',
  [Permission.SCHEDULE_WRITE]: 'Configurar schedule',
  [Permission.WEBHOOK_READ]: 'Ver webhooks entrantes',
  [Permission.WEBHOOK_WRITE]: 'Gestionar webhooks entrantes',
  [Permission.OUTBOUND_READ]: 'Ver integraciones salientes',
  [Permission.OUTBOUND_WRITE]: 'Gestionar integraciones salientes',
};

/** Permissions grouped by area for the UI. Order is meaningful (rendering). */
export const PERMISSION_GROUPS: Array<{
  title: string;
  permissions: readonly Permission[];
}> = [
  {
    title: 'Proyecto',
    permissions: [Permission.PROJECT_VIEW, Permission.PROJECT_DELETE],
  },
  {
    title: 'Miembros',
    permissions: [Permission.MEMBERS_READ, Permission.MEMBERS_INVITE, Permission.MEMBERS_REMOVE],
  },
  {
    title: 'Sitios y auditorías',
    permissions: [
      Permission.SITE_READ,
      Permission.SITE_WRITE,
      Permission.SITE_DELETE,
      Permission.AUDIT_READ,
      Permission.AUDIT_RUN,
      Permission.ISSUE_UPDATE,
    ],
  },
  {
    title: 'Exportaciones y alertas',
    permissions: [
      Permission.EXPORT_READ,
      Permission.EXPORT_CREATE,
      Permission.ALERT_READ,
      Permission.ALERT_WRITE,
      Permission.SCHEDULE_READ,
      Permission.SCHEDULE_WRITE,
    ],
  },
  {
    title: 'Integraciones',
    permissions: [
      Permission.WEBHOOK_READ,
      Permission.WEBHOOK_WRITE,
      Permission.OUTBOUND_READ,
      Permission.OUTBOUND_WRITE,
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  [Role.OWNER]: 'Owner',
  [Role.MEMBER]: 'Member',
  [Role.VIEWER]: 'Viewer',
};

export function isOwnerExclusive(permission: Permission): boolean {
  return OWNER_EXCLUSIVE_PERMISSIONS.has(permission);
}

export function isGrantable(permission: Permission): boolean {
  return GRANTABLE_PERMISSIONS.has(permission);
}

export function getRoleDefaults(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

/**
 * Given the role and the desired effective set, compute the (extra, revoked)
 * arrays to send to the backend. Reverse of computeEffectivePermissions.
 */
export function diffAgainstRoleDefaults(
  role: Role,
  effective: ReadonlySet<Permission>,
): { extra: Permission[]; revoked: Permission[] } {
  const defaults = ROLE_PERMISSIONS[role];
  const extra: Permission[] = [];
  const revoked: Permission[] = [];
  for (const p of effective) {
    if (!defaults.has(p)) extra.push(p);
  }
  for (const p of defaults) {
    if (!effective.has(p)) revoked.push(p);
  }
  return { extra, revoked };
}

export { Permission, Role, computeEffectivePermissions };
