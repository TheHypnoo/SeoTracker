export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IssueState = 'OPEN' | 'IGNORED' | 'FIXED';

export type AuditIssue = {
  id: string;
  severity: Severity;
  category: string;
  issueCode: string;
  message: string;
  resourceUrl: string | null;
  meta: Record<string, unknown> | null;
  projectIssueId: string | null;
  state: IssueState | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type IssueGroup = {
  code: string;
  severity: Severity;
  category: string;
  items: AuditIssue[];
  anyIgnored: boolean;
  allIgnored: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type AuditRun = {
  id: string;
  siteId: string;
  trigger: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | string;
  score: number | null;
  httpStatus: number | null;
  responseMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  issuesCount: number;
  severityCounts: Record<Severity, number>;
  categoryScores: Record<string, number> | null;
  scoreBreakdown: {
    perSeverity: Record<Severity, { rawDeduction: number; cappedDeduction: number }>;
    totalDeduction: number;
  } | null;
  previousScore: number | null;
  scoreDelta: number | null;
  site: {
    id: string;
    name: string;
    domain: string;
  };
  metrics: Array<{
    id: string;
    key: string;
    valueNum: number | null;
    valueText: string | null;
  }>;
  pages: Array<{
    id: string;
    url: string;
    statusCode: number | null;
    responseMs: number | null;
    contentType: string | null;
    score: number | null;
  }>;
  failureReason: string | null;
};

export type ExportKind = 'ISSUES' | 'METRICS' | 'AUDIT_RESULT';
