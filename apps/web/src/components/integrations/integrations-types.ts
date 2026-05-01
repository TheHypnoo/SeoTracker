import { OutboundEvent } from '@seotracker/shared-types';

export type OutboundWebhook = {
  id: string;
  projectId: string;
  name: string;
  url: string;
  headerName: string | null;
  headerValue: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OutboundDelivery = {
  id: string;
  outboundWebhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attemptCount: number;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export const EVENT_LABELS: Record<string, string> = {
  [OutboundEvent.AUDIT_COMPLETED]: 'Auditoría completada',
  [OutboundEvent.AUDIT_FAILED]: 'Auditoría fallida',
  [OutboundEvent.ISSUE_CRITICAL]: 'Problema crítico',
  [OutboundEvent.SITE_REGRESSION]: 'Regresión de score',
};

export const ALL_EVENTS: readonly string[] = Object.values(OutboundEvent);

export const STATUS_TONE: Record<OutboundDelivery['status'], 'success' | 'warning' | 'danger'> = {
  SUCCESS: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};

export function statusLabel(status: OutboundDelivery['status']): string {
  switch (status) {
    case 'SUCCESS':
      return 'Entregado';
    case 'PENDING':
      return 'En cola';
    case 'FAILED':
      return 'Fallido';
    default:
      return status;
  }
}
