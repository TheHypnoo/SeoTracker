import { z } from 'zod';

export const auditIssueMetaSchema = z.record(z.string(), z.unknown()).default({});

export const auditEventPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('RUN_STARTED'),
    trigger: z.string(),
  }),
  z.object({
    issues: z.number().int().nonnegative(),
    kind: z.literal('RUN_COMPLETED'),
    score: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('RUN_FAILED'),
    reason: z.string(),
  }),
  z.object({
    data: z.record(z.string(), z.unknown()),
    kind: z.literal('GENERIC'),
  }),
]);

export type AuditEventPayload = z.infer<typeof auditEventPayloadSchema>;

export const auditComparisonChangeMetaSchema = z.record(z.string(), z.unknown()).default({});

export const auditExportFiltersSchema = z
  .object({
    from: z.string().optional(),
    severity: z.string().optional(),
    status: z.string().optional(),
    to: z.string().optional(),
    trigger: z.string().optional(),
  })
  .catchall(z.unknown())
  .default({});

export type AuditExportFilters = z.infer<typeof auditExportFiltersSchema>;

export const systemLogContextSchema = z.record(z.string(), z.unknown()).default({});

export type SystemLogContext = z.infer<typeof systemLogContextSchema>;
