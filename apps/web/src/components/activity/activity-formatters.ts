import { ActivityAction, Role } from '@seotracker/shared-types';

/**
 * Spanish presentation strings + grouping for the activity timeline.
 * Centralized here so the UI doesn't pepper Spanish text and switch
 * statements all over the route file.
 */
const ACTION_LABELS: Record<ActivityAction, string> = {
  [ActivityAction.PROJECT_CREATED]: 'Proyecto creado',
  [ActivityAction.MEMBER_INVITED]: 'Invitación enviada',
  [ActivityAction.MEMBER_ACCEPTED]: 'Invitación aceptada',
  [ActivityAction.MEMBER_REMOVED]: 'Miembro expulsado',
  [ActivityAction.MEMBER_PERMS_UPDATED]: 'Permisos actualizados',
  [ActivityAction.SITE_CREATED]: 'Sitio creado',
  [ActivityAction.SITE_UPDATED]: 'Sitio actualizado',
  [ActivityAction.SITE_DELETED]: 'Sitio eliminado',
  [ActivityAction.AUDIT_RUN]: 'Auditoría lanzada',
  [ActivityAction.AUDIT_COMPLETED]: 'Auditoría completada',
  [ActivityAction.AUDIT_FAILED]: 'Auditoría fallida',
  [ActivityAction.ISSUE_IGNORED]: 'Issue ignorado',
  [ActivityAction.ISSUE_RESTORED]: 'Issue restaurado',
  [ActivityAction.WEBHOOK_CREATED]: 'Webhook creado',
  [ActivityAction.WEBHOOK_DELETED]: 'Webhook eliminado',
  [ActivityAction.WEBHOOK_ROTATED]: 'Secreto de webhook rotado',
  [ActivityAction.OUTBOUND_CREATED]: 'Integración saliente creada',
  [ActivityAction.OUTBOUND_DELETED]: 'Integración saliente eliminada',
  [ActivityAction.OUTBOUND_ROTATED]: 'Secreto de integración rotado',
  [ActivityAction.SCHEDULE_UPDATED]: 'Schedule actualizado',
  [ActivityAction.ALERT_UPDATED]: 'Alerta actualizada',
  [ActivityAction.CRAWL_CONFIG_UPDATED]: 'Config de crawler actualizada',
  [ActivityAction.PUBLIC_BADGE_TOGGLED]: 'Badge público activado/desactivado',
};

const ROLE_LABELS: Record<Role, string> = {
  [Role.OWNER]: 'Owner',
  [Role.MEMBER]: 'Member',
  [Role.VIEWER]: 'Viewer',
};

const TONE_BY_ACTION: Record<string, 'neutral' | 'positive' | 'warning' | 'danger'> = {
  [ActivityAction.SITE_DELETED]: 'danger',
  [ActivityAction.MEMBER_REMOVED]: 'danger',
  [ActivityAction.AUDIT_FAILED]: 'danger',
  [ActivityAction.AUDIT_COMPLETED]: 'positive',
  [ActivityAction.PROJECT_CREATED]: 'positive',
  [ActivityAction.SITE_CREATED]: 'positive',
  [ActivityAction.MEMBER_ACCEPTED]: 'positive',
  [ActivityAction.WEBHOOK_ROTATED]: 'warning',
  [ActivityAction.OUTBOUND_ROTATED]: 'warning',
  [ActivityAction.MEMBER_PERMS_UPDATED]: 'warning',
};

const TONE_CLASS: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  positive: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action as ActivityAction] ?? action;
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role as Role] ?? role;
}

export function toneClass(action: string): string {
  const tone = TONE_BY_ACTION[action] ?? 'neutral';
  return TONE_CLASS[tone] ?? TONE_CLASS.neutral!;
}

/**
 * Plain-text summary of an entry — short enough for a one-line row.
 * Uses metadata to enrich the action label when it carries useful detail
 * (e.g. invited email, role change, site name).
 */
export function summaryFor(entry: {
  action: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case ActivityAction.MEMBER_INVITED:
      return typeof meta.email === 'string' ? `Invitó a ${meta.email}` : 'Envió una invitación';
    case ActivityAction.MEMBER_ACCEPTED:
      return typeof meta.email === 'string'
        ? `Aceptó la invitación (${meta.email})`
        : 'Aceptó la invitación';
    case ActivityAction.MEMBER_PERMS_UPDATED: {
      const previousRole = roleLabel(meta.previousRole as string | undefined);
      const newRole = roleLabel(meta.newRole as string | undefined);
      const extra = Array.isArray(meta.extraPermissions) ? meta.extraPermissions.length : 0;
      const revoked = Array.isArray(meta.revokedPermissions) ? meta.revokedPermissions.length : 0;
      const parts: string[] = [`${previousRole} → ${newRole}`];
      if (extra) parts.push(`+${extra} extra`);
      if (revoked) parts.push(`-${revoked} revocados`);
      return parts.join(' · ');
    }
    case ActivityAction.SITE_CREATED:
      return typeof meta.name === 'string' && typeof meta.domain === 'string'
        ? `${meta.name} (${meta.domain})`
        : ((meta.domain as string) ?? '');
    case ActivityAction.SITE_DELETED:
      return typeof meta.domain === 'string' ? `Eliminó ${meta.domain}` : 'Eliminó un sitio';
    case ActivityAction.AUDIT_RUN:
      return typeof meta.trigger === 'string' ? `Trigger: ${meta.trigger}` : '';
    default:
      return '';
  }
}
