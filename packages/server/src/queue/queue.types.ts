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

export interface GscImportJobData {
  siteId: string;
  /** Optional explicit window; when omitted the processor imports the recent rolling window. */
  startDate?: string;
  endDate?: string;
  /** Marks a one-off historical backfill so the processor paginates the full range. */
  backfill?: boolean;
  requestId?: string;
}

export type QueueJobPayload =
  | AuditJobData
  | ExportJobData
  | OutboundDeliveryJobData
  | EmailDeliveryJobData
  | GscImportJobData;
