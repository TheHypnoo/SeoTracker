import {
  AuditStatus,
  AuditTrigger,
  ComparisonChangeType,
  EmailDeliveryStatus,
  ExportFormat,
  ExportKind,
  ExportStatus,
  IndexabilityStatus,
  IssueCategory,
  IssueCode,
  IssueState,
  LogLevel,
  OutboundDeliveryStatus,
  Role,
  ScheduleFrequency,
  SeoActionEffort,
  SeoActionImpact,
  Severity,
} from '@seotracker/shared-types';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Membership role inside a project. OWNER can invite/remove members; MEMBER is read/write; VIEWER is read-only. */
export const roleEnum = pgEnum('role', [Role.OWNER, Role.MEMBER, Role.VIEWER]);

/** Cadence at which a site is automatically audited by the scheduler. */
export const scheduleFrequencyEnum = pgEnum('schedule_frequency', [
  ScheduleFrequency.DAILY,
  ScheduleFrequency.WEEKLY,
]);

/** What started an audit run: a user click, the cron scheduler, or an inbound webhook. */
export const auditTriggerEnum = pgEnum('audit_trigger', [
  AuditTrigger.MANUAL,
  AuditTrigger.SCHEDULED,
  AuditTrigger.WEBHOOK,
]);

/** Lifecycle of an audit run from enqueue to terminal state. */
export const auditStatusEnum = pgEnum('audit_status', [
  AuditStatus.QUEUED,
  AuditStatus.RUNNING,
  AuditStatus.COMPLETED,
  AuditStatus.FAILED,
]);

/** Severity bucket attached to each issue, drives scoring weights and alert priorities. */
export const severityEnum = pgEnum('severity', [
  Severity.CRITICAL,
  Severity.HIGH,
  Severity.MEDIUM,
  Severity.LOW,
]);

/**
 * Closed catalogue of issue codes the SEO engine can report.
 * Sourced dynamically from `@seotracker/shared-types` so the enum stays in lockstep with the detectors.
 */
export const issueCodeEnum = pgEnum(
  'issue_code',
  Object.values(IssueCode) as [IssueCode, ...IssueCode[]],
);

/** High-level grouping of issues (ON_PAGE, TECHNICAL, CRAWLABILITY, MEDIA, PERFORMANCE). */
export const issueCategoryEnum = pgEnum(
  'issue_category',
  Object.values(IssueCategory) as [IssueCategory, ...IssueCategory[]],
);

export const indexabilityStatusEnum = pgEnum(
  'indexability_status',
  Object.values(IndexabilityStatus) as [IndexabilityStatus, ...IndexabilityStatus[]],
);

export const seoActionImpactEnum = pgEnum(
  'seo_action_impact',
  Object.values(SeoActionImpact) as [SeoActionImpact, ...SeoActionImpact[]],
);

export const seoActionEffortEnum = pgEnum(
  'seo_action_effort',
  Object.values(SeoActionEffort) as [SeoActionEffort, ...SeoActionEffort[]],
);

/** Log severity used by `system_logs` for structured backend traces. */
export const logLevelEnum = pgEnum('log_level', [
  LogLevel.DEBUG,
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
]);

/** Direction of change between two audit runs (added, removed, severity_changed, etc.). */
export const comparisonChangeTypeEnum = pgEnum(
  'comparison_change_type',
  Object.values(ComparisonChangeType) as [ComparisonChangeType, ...ComparisonChangeType[]],
);

/** Output format for exports requested by users. */
export const exportFormatEnum = pgEnum('export_format', [
  ExportFormat.CSV,
  ExportFormat.PDF,
  ExportFormat.JSON,
]);

/** What an export contains: full history, a single run, a comparison, just issues, or just metrics. */
export const exportKindEnum = pgEnum('export_kind', [
  ExportKind.HISTORY,
  ExportKind.AUDIT_RESULT,
  ExportKind.COMPARISON,
  ExportKind.ISSUES,
  ExportKind.METRICS,
  ExportKind.ACTION_PLAN,
  ExportKind.INDEXABILITY,
]);

/** Lifecycle of an export job from request to terminal state (or expiration). */
export const exportStatusEnum = pgEnum('export_status', [
  ExportStatus.PENDING,
  ExportStatus.PROCESSING,
  ExportStatus.COMPLETED,
  ExportStatus.FAILED,
  ExportStatus.EXPIRED,
]);

/** State machine for a long-lived issue tracked at site level (not per-run). */
export const issueStateEnum = pgEnum('issue_state', [
  IssueState.OPEN,
  IssueState.IGNORED,
  IssueState.FIXED,
]);

/** Outcome of a single outbound webhook delivery attempt. */
export const outboundDeliveryStatusEnum = pgEnum('outbound_delivery_status', [
  OutboundDeliveryStatus.PENDING,
  OutboundDeliveryStatus.SUCCESS,
  OutboundDeliveryStatus.FAILED,
]);

/** Lifecycle of an outbound email through the delivery queue. */
export const emailDeliveryStatusEnum = pgEnum('email_delivery_status', [
  EmailDeliveryStatus.PENDING,
  EmailDeliveryStatus.SENDING,
  EmailDeliveryStatus.SENT,
  EmailDeliveryStatus.FAILED,
]);

/** Application users. Authentication uses Argon2 password hashes; email is unique and case-sensitive. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_email_idx').on(table.email)],
);

/**
 * Per-user preferences. Persists the active project so the UI restores context across sessions,
 * plus per-user opt-outs for the three transactional email channels (audit completed, regression
 * detected, new critical issues). All email flags default to true; users can disable individually.
 */
export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  activeProjectId: uuid('active_project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  emailOnAuditCompleted: boolean('email_on_audit_completed').notNull().default(true),
  emailOnAuditRegression: boolean('email_on_audit_regression').notNull().default(true),
  emailOnCriticalIssues: boolean('email_on_critical_issues').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Refresh tokens issued during login. Stored hashed; rotated on every refresh and revoked on logout
 * or when a stolen token is detected (replay attempt against an already-rotated token).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('refresh_tokens_user_idx').on(table.userId)],
);

/** Single-use tokens for the password reset flow. Hashed at rest and consumed by setting `usedAt`. */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('password_reset_tokens_token_hash_uk').on(table.tokenHash),
    index('password_reset_tokens_user_idx').on(table.userId),
  ],
);

/** A project is the top-level tenant boundary: groups sites, members, webhooks and settings. */
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Associative table for the N:M relationship between users and projects. Stores the role of each
 * member plus per-member capability overrides: extras grant additional permissions, revoked drops
 * permissions that the role would normally include.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    extraPermissions: text('extra_permissions').array().notNull().default([]),
    revokedPermissions: text('revoked_permissions').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_members_user_idx').on(table.userId),
  ],
);

/** Pending invitations to join a project. Token is hashed; consumed by setting `acceptedAt`. */
export const projectInvites = pgTable(
  'project_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    role: roleEnum('role').notNull(),
    extraPermissions: text('extra_permissions').array().notNull().default([]),
    revokedPermissions: text('revoked_permissions').array().notNull().default([]),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('project_invites_token_hash_uk').on(table.tokenHash),
    index('project_invites_project_idx').on(table.projectId),
    index('project_invites_email_idx').on(table.email),
  ],
);

/**
 * Sites belonging to a project. `normalizedDomain` is the canonical form (lower-cased, no trailing slash,
 * no protocol) used for uniqueness and SSRF-safe lookups.
 */
export const sites = pgTable(
  'sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    normalizedDomain: varchar('normalized_domain', { length: 255 }).notNull(),
    timezone: varchar('timezone', { length: 100 }).notNull(),
    active: boolean('active').default(true).notNull(),
    /** Opt-in flag: when true, the site exposes a public SVG badge with its latest score. */
    publicBadgeEnabled: boolean('public_badge_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sites_project_domain_uk').on(table.projectId, table.normalizedDomain),
    index('sites_project_idx').on(table.projectId),
    index('sites_project_name_idx').on(table.projectId, table.name),
    index('sites_project_domain_idx').on(table.projectId, table.normalizedDomain),
  ],
);

/** Optional automatic audit schedule for a site (1:1). Evaluated by the scheduler service every minute. */
export const siteSchedules = pgTable(
  'site_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    frequency: scheduleFrequencyEnum('frequency').notNull(),
    dayOfWeek: integer('day_of_week'),
    timeOfDay: varchar('time_of_day', { length: 5 }).notNull(),
    timezone: varchar('timezone', { length: 100 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('site_schedules_site_uk').on(table.siteId)],
);

/** Per-site notification rules. Decoupled from audits so users can tweak alerts without touching audit history. */
export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').default(true).notNull(),
    notifyOnScoreDrop: boolean('notify_on_score_drop').default(true).notNull(),
    scoreDropThreshold: integer('score_drop_threshold').default(1).notNull(),
    notifyOnNewCriticalIssues: boolean('notify_on_new_critical_issues').default(true).notNull(),
    notifyOnIssueCountIncrease: boolean('notify_on_issue_count_increase').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('alert_rules_site_uk').on(table.siteId)],
);

/**
 * Inbound webhook endpoints exposed to external integrations to trigger audits.
 * `endpointKey` and `endpointPath` are unique routing keys; secret rotation is tracked in `webhook_secrets`.
 */
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    endpointKey: varchar('endpoint_key', { length: 120 }).notNull(),
    endpointPath: varchar('endpoint_path', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('webhook_endpoints_key_uk').on(table.endpointKey),
    unique('webhook_endpoints_path_uk').on(table.endpointPath),
    index('webhook_endpoints_project_idx').on(table.projectId),
  ],
);

/** Hashed signing secrets for inbound webhooks. Multiple rows per endpoint allow zero-downtime rotation. */
export const webhookSecrets = pgTable(
  'webhook_secrets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    webhookEndpointId: uuid('webhook_endpoint_id').references(() => webhookEndpoints.id, {
      onDelete: 'set null',
    }),
    secretHash: text('secret_hash').notNull(),
    active: boolean('active').default(true).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('webhook_secrets_project_idx').on(table.projectId),
    index('webhook_secrets_endpoint_idx').on(table.webhookEndpointId),
  ],
);

/**
 * One execution of the SEO engine against a site. Carries final score, per-category breakdown,
 * and HTTP-level metadata. Issues, pages, metrics and events are normalised in dedicated tables.
 */
export const auditRuns = pgTable(
  'audit_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    trigger: auditTriggerEnum('trigger').notNull(),
    status: auditStatusEnum('status').notNull().default(AuditStatus.QUEUED),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    httpStatus: integer('http_status'),
    responseMs: integer('response_ms'),
    score: integer('score'),
    categoryScores: jsonb('category_scores').$type<Record<string, number>>(),
    scoreBreakdown: jsonb('score_breakdown').$type<{
      perSeverity: Record<string, { rawDeduction: number; cappedDeduction: number }>;
      totalDeduction: number;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_runs_site_idx').on(table.siteId),
    index('audit_runs_status_idx').on(table.status),
    index('audit_runs_site_created_idx').on(table.siteId, table.createdAt),
    index('audit_runs_site_score_idx').on(table.siteId, table.score),
    index('audit_runs_site_trigger_idx').on(table.siteId, table.trigger),
  ],
);

/** One row per crawled URL inside an audit run. Holds HTTP-level metrics and per-page score. */
export const auditPages = pgTable(
  'audit_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    statusCode: integer('status_code'),
    responseMs: integer('response_ms'),
    contentType: varchar('content_type', { length: 128 }),
    score: integer('score'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_pages_run_idx').on(table.auditRunId)],
);

export type UrlInspectionEvidence = Record<string, unknown>;

export const auditUrlInspections = pgTable(
  'audit_url_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    source: varchar('source', { length: 40 }).notNull(),
    statusCode: integer('status_code'),
    indexabilityStatus: indexabilityStatusEnum('indexability_status').notNull(),
    canonicalUrl: text('canonical_url'),
    robotsDirective: text('robots_directive'),
    xRobotsTag: text('x_robots_tag'),
    sitemapIncluded: boolean('sitemap_included').notNull().default(false),
    evidence: jsonb('evidence').$type<UrlInspectionEvidence>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_url_inspections_run_idx').on(table.auditRunId),
    index('audit_url_inspections_status_idx').on(table.auditRunId, table.indexabilityStatus),
    index('audit_url_inspections_source_idx').on(table.auditRunId, table.source),
  ],
);

/** Issues detected within a single audit run. Use `site_issues` for the cross-run state machine view. */
export const auditIssues = pgTable(
  'audit_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    issueCode: issueCodeEnum('issue_code').notNull(),
    category: issueCategoryEnum('category').notNull().default(IssueCategory.TECHNICAL),
    severity: severityEnum('severity').notNull(),
    message: text('message').notNull(),
    resourceUrl: text('resource_url'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_issues_run_idx').on(table.auditRunId),
    index('audit_issues_severity_idx').on(table.severity),
    index('audit_issues_category_idx').on(table.category),
    index('audit_issues_run_code_idx').on(table.auditRunId, table.issueCode),
  ],
);

export type AuditActionAffectedPages = string[];

export const auditActionItems = pgTable(
  'audit_action_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    issueCode: issueCodeEnum('issue_code').notNull(),
    category: issueCategoryEnum('category').notNull().default(IssueCategory.TECHNICAL),
    severity: severityEnum('severity').notNull(),
    priorityScore: integer('priority_score').notNull(),
    impact: seoActionImpactEnum('impact').notNull(),
    effort: seoActionEffortEnum('effort').notNull(),
    scoreImpactPoints: integer('score_impact_points').notNull(),
    occurrences: integer('occurrences').notNull(),
    affectedPagesCount: integer('affected_pages_count').notNull(),
    affectedPages: jsonb('affected_pages').$type<AuditActionAffectedPages>().default([]).notNull(),
    evidenceSummary: text('evidence_summary').notNull(),
    priorityReason: text('priority_reason').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    remediationPrompt: text('remediation_prompt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('audit_action_items_run_code_uk').on(table.auditRunId, table.issueCode),
    index('audit_action_items_run_idx').on(table.auditRunId),
    index('audit_action_items_priority_idx').on(table.auditRunId, table.priorityScore),
  ],
);

/**
 * Long-lived issue per site, deduplicated across runs by the (siteId, issueCode, resourceKey) fingerprint.
 * State transitions: OPEN → FIXED (auto-closed when no longer detected) or OPEN → IGNORED (user action).
 */
export const siteIssues = pgTable(
  'site_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    issueCode: issueCodeEnum('issue_code').notNull(),
    resourceKey: text('resource_key').notNull().default(''),
    category: issueCategoryEnum('category').notNull().default(IssueCategory.TECHNICAL),
    severity: severityEnum('severity').notNull(),
    message: text('message').notNull(),
    state: issueStateEnum('state').notNull().default(IssueState.OPEN),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    firstSeenAuditRunId: uuid('first_seen_audit_run_id').references(() => auditRuns.id, {
      onDelete: 'set null',
    }),
    lastSeenAuditRunId: uuid('last_seen_audit_run_id').references(() => auditRuns.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ignoredAt: timestamp('ignored_at', { withTimezone: true }),
    ignoredByUserId: uuid('ignored_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    occurrenceCount: integer('occurrence_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('site_issues_fingerprint_uk').on(table.siteId, table.issueCode, table.resourceKey),
    index('site_issues_site_state_idx').on(table.siteId, table.state),
    index('site_issues_state_idx').on(table.state),
  ],
);

/** Free-form key/value metrics captured during an audit run (timings, counts, scores per dimension). */
export const auditMetrics = pgTable(
  'audit_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 120 }).notNull(),
    valueNum: doublePrecision('value_num'),
    valueText: text('value_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_metrics_run_idx').on(table.auditRunId)],
);

/** Persisted diff between two audit runs of the same site. Avoids recomputing comparisons on demand. */
export const auditComparisons = pgTable(
  'audit_comparisons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    baselineAuditRunId: uuid('baseline_audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    targetAuditRunId: uuid('target_audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    scoreDelta: integer('score_delta').default(0).notNull(),
    issuesDelta: integer('issues_delta').default(0).notNull(),
    regressionsCount: integer('regressions_count').default(0).notNull(),
    improvementsCount: integer('improvements_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('audit_comparisons_runs_uk').on(table.baselineAuditRunId, table.targetAuditRunId),
    index('audit_comparisons_site_idx').on(table.siteId),
  ],
);

/** Itemised changes (added/removed/severity_changed) backing a comparison. */
export const auditComparisonChanges = pgTable(
  'audit_comparison_changes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    comparisonId: uuid('comparison_id')
      .notNull()
      .references(() => auditComparisons.id, { onDelete: 'cascade' }),
    changeType: comparisonChangeTypeEnum('change_type').notNull(),
    issueCode: issueCodeEnum('issue_code'),
    issueCategory: issueCategoryEnum('issue_category'),
    severity: severityEnum('severity'),
    title: varchar('title', { length: 200 }).notNull(),
    delta: integer('delta'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_comparison_changes_idx').on(table.comparisonId, table.changeType)],
);

/**
 * User-requested exports (CSV/PDF/JSON of history, single runs, comparisons, issues or metrics).
 * Processed asynchronously by the exports queue; the final file lives at `storagePath` until `expiresAt`.
 */
export const auditExports = pgTable(
  'audit_exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    auditRunId: uuid('audit_run_id').references(() => auditRuns.id, {
      onDelete: 'set null',
    }),
    comparisonId: uuid('comparison_id').references(() => auditComparisons.id, {
      onDelete: 'set null',
    }),
    kind: exportKindEnum('kind').notNull(),
    format: exportFormatEnum('format').notNull(),
    status: exportStatusEnum('status').notNull().default(ExportStatus.PENDING),
    filters: jsonb('filters').$type<Record<string, unknown>>().default({}).notNull(),
    fileName: varchar('file_name', { length: 255 }),
    storagePath: text('storage_path'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('audit_exports_user_idx').on(table.requestedByUserId),
    index('audit_exports_site_idx').on(table.siteId),
    index('audit_exports_status_idx').on(table.status),
  ],
);

/** In-app notifications for a user (regression alerts, completed exports, etc.). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 80 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId),
    index('notifications_read_idx').on(table.readAt),
  ],
);

/** Lifecycle events emitted during an audit run (started, page-fetched, finished, error). Useful for debugging. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_events_run_idx').on(table.auditRunId)],
);

/** Durable record of jobs that exhausted their BullMQ retries. Survives Redis flushes; used for forensic analysis. */
export const jobFailures = pgTable(
  'job_failures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queueName: varchar('queue_name', { length: 64 }).notNull(),
    jobName: varchar('job_name', { length: 120 }).notNull(),
    jobId: varchar('job_id', { length: 120 }),
    attempts: integer('attempts').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    reason: text('reason').notNull(),
    stack: text('stack'),
    failedAt: timestamp('failed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_failures_queue_idx').on(table.queueName),
    index('job_failures_failed_at_idx').on(table.failedAt),
  ],
);

/** Structured backend logs persisted to the database (errors, traces, async-task diagnostics). */
export const systemLogs = pgTable(
  'system_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id').references(() => auditRuns.id, {
      onDelete: 'set null',
    }),
    level: logLevelEnum('level').notNull(),
    source: varchar('source', { length: 120 }).notNull(),
    message: text('message').notNull(),
    context: jsonb('context').$type<Record<string, unknown>>().default({}).notNull(),
    trace: text('trace'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('system_logs_run_idx').on(table.auditRunId),
    index('system_logs_level_idx').on(table.level),
    index('system_logs_created_idx').on(table.createdAt),
  ],
);

/** Outbound webhook configuration. The project owner registers a URL and selects which events to subscribe to. */
export const outboundWebhooks = pgTable(
  'outbound_webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    url: text('url').notNull(),
    headerName: varchar('header_name', { length: 120 }),
    headerValue: text('header_value'),
    secret: text('secret').notNull(),
    events: text('events').array().notNull().default([]),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('outbound_webhooks_project_idx').on(table.projectId)],
);

/** One row per delivery attempt for an outbound webhook. Captures HTTP response, errors, and retry count. */
export const outboundWebhookDeliveries = pgTable(
  'outbound_webhook_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outboundWebhookId: uuid('outbound_webhook_id')
      .notNull()
      .references(() => outboundWebhooks.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 120 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: outboundDeliveryStatusEnum('status').default(OutboundDeliveryStatus.PENDING).notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    errorMessage: text('error_message'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('outbound_webhook_deliveries_webhook_idx').on(table.outboundWebhookId),
    index('outbound_webhook_deliveries_created_idx').on(table.createdAt),
  ],
);

/**
 * Per-site crawler tuning knobs. Replaces the previous global constants so owners can throttle
 * aggressive auditing on weak servers, or relax limits on their own infra. Defaults match the
 * legacy global values; absence of a row means "use service-level defaults".
 */
export const siteCrawlConfigs = pgTable('site_crawl_configs', {
  siteId: uuid('site_id')
    .primaryKey()
    .references(() => sites.id, { onDelete: 'cascade' }),
  maxPages: integer('max_pages').notNull().default(50),
  maxDepth: integer('max_depth').notNull().default(2),
  maxConcurrentPages: integer('max_concurrent_pages').notNull().default(5),
  requestDelayMs: integer('request_delay_ms').notNull().default(0),
  respectCrawlDelay: boolean('respect_crawl_delay').notNull().default(true),
  userAgent: varchar('user_agent', { length: 255 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Append-only project activity log. Captures who did what, with the role snapshot at the time,
 * plus enough metadata to render a timeline without joining back to mutable tables. Resource
 * type/id are loose strings so we can extend the catalogue without schema migrations.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Snapshot of the actor's role at the time of the action. */
    role: roleEnum('role'),
    /** Catalogued action key; see ActivityAction in shared-types. */
    action: varchar('action', { length: 64 }).notNull(),
    /** Loose tag for the resource the action operates on (site, audit, member, ...). */
    resourceType: varchar('resource_type', { length: 32 }),
    resourceId: uuid('resource_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('activity_log_project_created_idx').on(table.projectId, table.createdAt),
    index('activity_log_site_idx').on(table.siteId),
    index('activity_log_user_idx').on(table.userId),
  ],
);

/**
 * Outbound email log. One row per delivery attempt against an SMTP provider. Captures status,
 * retry counts and provider response so failures can be inspected without rummaging through
 * provider dashboards.
 */
export const emailDeliveries = pgTable(
  'email_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    notificationType: varchar('notification_type', { length: 80 }),
    recipientEmail: varchar('recipient_email', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 300 }).notNull(),
    textBody: text('text_body').notNull(),
    htmlBody: text('html_body'),
    status: emailDeliveryStatusEnum('status').default(EmailDeliveryStatus.PENDING).notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    providerResponse: text('provider_response'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('email_deliveries_status_idx').on(table.status),
    index('email_deliveries_user_idx').on(table.userId),
    index('email_deliveries_project_idx').on(table.projectId),
    index('email_deliveries_created_idx').on(table.createdAt),
  ],
);
