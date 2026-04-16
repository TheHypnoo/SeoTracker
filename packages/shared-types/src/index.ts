export enum Role {
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

/**
 * Capability-style permissions used by ProjectsService.assertPermission and
 * the @RequirePermission decorator. The set is intentionally small and
 * verbose — read-only operations get .read, mutations get .write/.create/etc.
 *
 * Effective permissions for a user on a project are computed as:
 *   ROLE_PERMISSIONS[role] ∪ extraPermissions − revokedPermissions
 *
 * with the constraint that OWNERs always have ALL permissions (overrides ignored)
 * and that OWNER_EXCLUSIVE permissions cannot be granted to MEMBER/VIEWER.
 */
export enum Permission {
  PROJECT_VIEW = 'project.view',
  PROJECT_DELETE = 'project.delete',
  MEMBERS_READ = 'members.read',
  MEMBERS_INVITE = 'members.invite',
  MEMBERS_REMOVE = 'members.remove',
  SITE_READ = 'site.read',
  SITE_WRITE = 'site.write',
  SITE_DELETE = 'site.delete',
  AUDIT_READ = 'audit.read',
  AUDIT_RUN = 'audit.run',
  ISSUE_UPDATE = 'issue.update',
  EXPORT_READ = 'export.read',
  EXPORT_CREATE = 'export.create',
  ALERT_READ = 'alert.read',
  ALERT_WRITE = 'alert.write',
  SCHEDULE_READ = 'schedule.read',
  SCHEDULE_WRITE = 'schedule.write',
  WEBHOOK_READ = 'webhook.read',
  WEBHOOK_WRITE = 'webhook.write',
  OUTBOUND_READ = 'outbound.read',
  OUTBOUND_WRITE = 'outbound.write',
}

/** Permissions that can ONLY be held by OWNER. They cannot be granted to MEMBER/VIEWER via overrides. */
export const OWNER_EXCLUSIVE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.PROJECT_DELETE,
  Permission.MEMBERS_INVITE,
  Permission.MEMBERS_REMOVE,
]);

const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(Object.values(Permission));

const MEMBER_DEFAULTS: ReadonlySet<Permission> = new Set([
  Permission.PROJECT_VIEW,
  Permission.MEMBERS_READ,
  Permission.SITE_READ,
  Permission.SITE_WRITE,
  Permission.SITE_DELETE,
  Permission.AUDIT_READ,
  Permission.AUDIT_RUN,
  Permission.ISSUE_UPDATE,
  Permission.EXPORT_READ,
  Permission.EXPORT_CREATE,
  Permission.ALERT_READ,
  Permission.ALERT_WRITE,
  Permission.SCHEDULE_READ,
  Permission.SCHEDULE_WRITE,
  Permission.WEBHOOK_READ,
  Permission.OUTBOUND_READ,
]);

const VIEWER_DEFAULTS: ReadonlySet<Permission> = new Set([
  Permission.PROJECT_VIEW,
  Permission.MEMBERS_READ,
  Permission.SITE_READ,
  Permission.AUDIT_READ,
  Permission.EXPORT_READ,
  Permission.ALERT_READ,
  Permission.SCHEDULE_READ,
]);

/** Default permission set per role. OWNER always has every permission. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.OWNER]: ALL_PERMISSIONS,
  [Role.MEMBER]: MEMBER_DEFAULTS,
  [Role.VIEWER]: VIEWER_DEFAULTS,
};

/**
 * Permissions that MEMBER/VIEWER are allowed to be granted (via extraPermissions).
 * Equals all permissions minus OWNER_EXCLUSIVE.
 */
export const GRANTABLE_PERMISSIONS: ReadonlySet<Permission> = new Set(
  Object.values(Permission).filter((p) => !OWNER_EXCLUSIVE_PERMISSIONS.has(p)),
);

/**
 * Compute the effective permission set for a user on a project.
 * - OWNER always returns the full set (overrides ignored).
 * - For MEMBER/VIEWER: defaults + extras − revoked.
 *   Owner-exclusive perms cannot leak in via extras.
 */
export function computeEffectivePermissions(
  role: Role,
  extraPermissions: readonly Permission[] = [],
  revokedPermissions: readonly Permission[] = [],
): Set<Permission> {
  if (role === Role.OWNER) return new Set(ALL_PERMISSIONS);
  const result = new Set(ROLE_PERMISSIONS[role]);
  for (const p of extraPermissions) {
    if (!OWNER_EXCLUSIVE_PERMISSIONS.has(p)) result.add(p);
  }
  for (const p of revokedPermissions) {
    result.delete(p);
  }
  return result;
}

/**
 * Catalogue of activity events emitted by the API and persisted in the
 * `activity_log` table. The frontend timeline uses this enum to look up
 * presentation logic (label, icon, color) per action.
 */
export enum ActivityAction {
  PROJECT_CREATED = 'project.created',
  MEMBER_INVITED = 'member.invited',
  MEMBER_ACCEPTED = 'member.accepted',
  MEMBER_REMOVED = 'member.removed',
  MEMBER_PERMS_UPDATED = 'member.perms_updated',
  SITE_CREATED = 'site.created',
  SITE_UPDATED = 'site.updated',
  SITE_DELETED = 'site.deleted',
  AUDIT_RUN = 'audit.run',
  AUDIT_COMPLETED = 'audit.completed',
  AUDIT_FAILED = 'audit.failed',
  ISSUE_IGNORED = 'issue.ignored',
  ISSUE_RESTORED = 'issue.restored',
  WEBHOOK_CREATED = 'webhook.created',
  WEBHOOK_DELETED = 'webhook.deleted',
  WEBHOOK_ROTATED = 'webhook.rotated',
  OUTBOUND_CREATED = 'outbound.created',
  OUTBOUND_DELETED = 'outbound.deleted',
  OUTBOUND_ROTATED = 'outbound.rotated',
  SCHEDULE_UPDATED = 'schedule.updated',
  ALERT_UPDATED = 'alert.updated',
  CRAWL_CONFIG_UPDATED = 'crawl_config.updated',
  PUBLIC_BADGE_TOGGLED = 'public_badge.toggled',
}

export enum AuditTrigger {
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
  WEBHOOK = 'WEBHOOK',
}

export enum AuditStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum IssueCategory {
  ON_PAGE = 'ON_PAGE',
  TECHNICAL = 'TECHNICAL',
  CRAWLABILITY = 'CRAWLABILITY',
  MEDIA = 'MEDIA',
  PERFORMANCE = 'PERFORMANCE',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum ScheduleFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
}

export enum IssueCode {
  DOMAIN_UNREACHABLE = 'DOMAIN_UNREACHABLE',
  MISSING_TITLE = 'MISSING_TITLE',
  TITLE_TOO_SHORT = 'TITLE_TOO_SHORT',
  TITLE_TOO_LONG = 'TITLE_TOO_LONG',
  MISSING_META_DESCRIPTION = 'MISSING_META_DESCRIPTION',
  META_DESCRIPTION_TOO_SHORT = 'META_DESCRIPTION_TOO_SHORT',
  META_DESCRIPTION_TOO_LONG = 'META_DESCRIPTION_TOO_LONG',
  MISSING_H1 = 'MISSING_H1',
  MULTIPLE_H1 = 'MULTIPLE_H1',
  HEADING_HIERARCHY_SKIP = 'HEADING_HIERARCHY_SKIP',
  MISSING_CANONICAL = 'MISSING_CANONICAL',
  CANONICAL_MISMATCH = 'CANONICAL_MISMATCH',
  MULTIPLE_CANONICALS = 'MULTIPLE_CANONICALS',
  CANONICAL_NOT_ABSOLUTE = 'CANONICAL_NOT_ABSOLUTE',
  IMAGE_WITHOUT_ALT = 'IMAGE_WITHOUT_ALT',
  IMAGE_MISSING_DIMENSIONS = 'IMAGE_MISSING_DIMENSIONS',
  MISSING_ROBOTS = 'MISSING_ROBOTS',
  MISSING_SITEMAP = 'MISSING_SITEMAP',
  BROKEN_LINK = 'BROKEN_LINK',
  MISSING_VIEWPORT = 'MISSING_VIEWPORT',
  MISSING_LANG = 'MISSING_LANG',
  MISSING_OPEN_GRAPH = 'MISSING_OPEN_GRAPH',
  MISSING_TWITTER_CARD = 'MISSING_TWITTER_CARD',
  MISSING_STRUCTURED_DATA = 'MISSING_STRUCTURED_DATA',
  INVALID_STRUCTURED_DATA = 'INVALID_STRUCTURED_DATA',
  STRUCTURED_DATA_MISSING_TYPE = 'STRUCTURED_DATA_MISSING_TYPE',
  INVALID_HREFLANG = 'INVALID_HREFLANG',
  MIXED_CONTENT = 'MIXED_CONTENT',
  NO_HTTPS = 'NO_HTTPS',
  MISSING_HSTS = 'MISSING_HSTS',
  REDIRECT_CHAIN = 'REDIRECT_CHAIN',
  ROBOTS_DISALLOWS_ALL = 'ROBOTS_DISALLOWS_ALL',
  SITEMAP_EMPTY = 'SITEMAP_EMPTY',
  SITEMAP_INVALID = 'SITEMAP_INVALID',
  MISSING_FAVICON = 'MISSING_FAVICON',
  PAGE_TOO_HEAVY = 'PAGE_TOO_HEAVY',
  DOM_TOO_LARGE = 'DOM_TOO_LARGE',
  META_NOINDEX = 'META_NOINDEX',
  META_NOFOLLOW = 'META_NOFOLLOW',
  AI_CRAWLERS_BLOCKED = 'AI_CRAWLERS_BLOCKED',
  SOFT_404 = 'SOFT_404',
  MISSING_COMPRESSION = 'MISSING_COMPRESSION',
  NO_LAZY_IMAGES = 'NO_LAZY_IMAGES',
  DUPLICATE_CONTENT = 'DUPLICATE_CONTENT',
  THIN_CONTENT = 'THIN_CONTENT',
  MISSING_ARTICLE_SCHEMA = 'MISSING_ARTICLE_SCHEMA',
  STALE_CONTENT = 'STALE_CONTENT',
  POOR_READABILITY = 'POOR_READABILITY',
  SHORT_BLOG_POST = 'SHORT_BLOG_POST',
  MISSING_AUTHOR = 'MISSING_AUTHOR',
}

export enum IssueState {
  OPEN = 'OPEN',
  IGNORED = 'IGNORED',
  FIXED = 'FIXED',
}

export enum ComparisonChangeType {
  SCORE_DROP = 'SCORE_DROP',
  SCORE_IMPROVEMENT = 'SCORE_IMPROVEMENT',
  NEW_ISSUE = 'NEW_ISSUE',
  RESOLVED_ISSUE = 'RESOLVED_ISSUE',
  SEVERITY_REGRESSION = 'SEVERITY_REGRESSION',
  SEVERITY_IMPROVEMENT = 'SEVERITY_IMPROVEMENT',
}

export enum ExportFormat {
  CSV = 'CSV',
  PDF = 'PDF',
  JSON = 'JSON',
}

export enum ExportKind {
  HISTORY = 'HISTORY',
  AUDIT_RESULT = 'AUDIT_RESULT',
  COMPARISON = 'COMPARISON',
  ISSUES = 'ISSUES',
  METRICS = 'METRICS',
}

export enum ExportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum OutboundEvent {
  AUDIT_COMPLETED = 'audit.completed',
  AUDIT_FAILED = 'audit.failed',
  ISSUE_CRITICAL = 'issue.critical',
  SITE_REGRESSION = 'site.regression',
}

export enum OutboundDeliveryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum EmailDeliveryStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface ApiError {
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
