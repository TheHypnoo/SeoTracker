export interface AuditJobData {
  auditRunId: string;
  siteId: string;
  requestId?: string;
}

export interface ExportJobData {
  exportId: string;
  requestId?: string;
}

export interface OutboundDeliveryJobData {
  deliveryId: string;
  requestId?: string;
}

export interface EmailDeliveryJobData {
  deliveryId: string;
  requestId?: string;
}

export type QueueJobPayload =
  | AuditJobData
  | ExportJobData
  | OutboundDeliveryJobData
  | EmailDeliveryJobData;
