export interface AuditRun {
  id: string;
  trigger: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK';
  status: string;
  score: number | null;
  httpStatus: number | null;
  responseMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  issuesCount: number;
  criticalIssuesCount: number;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  projectId: string;
}

export interface Schedule {
  frequency: 'DAILY' | 'WEEKLY';
  dayOfWeek: number | null;
  timeOfDay: string;
  timezone: string;
  enabled: boolean;
}

export interface ScheduleFormState {
  frequency: 'DAILY' | 'WEEKLY';
  dayOfWeek: string;
  timeOfDay: string;
  timezone: string;
}

export interface AlertRule {
  enabled: boolean;
  notifyOnScoreDrop: boolean;
  scoreDropThreshold: number;
  notifyOnNewCriticalIssues: boolean;
  notifyOnIssueCountIncrease: boolean;
}

export interface ComparisonItem {
  id: string;
  baselineAuditRunId: string;
  targetAuditRunId: string;
  scoreDelta: number;
  issuesDelta: number;
  regressionsCount: number;
  improvementsCount: number;
  createdAt: string;
  baselineRun: {
    id: string;
    createdAt: string;
    score: number | null;
  } | null;
  targetRun: {
    id: string;
    createdAt: string;
    score: number | null;
  } | null;
}

export interface ComparisonDetail {
  comparison: {
    id: string;
    scoreDelta: number;
    issuesDelta: number;
    regressionsCount: number;
    improvementsCount: number;
  };
  from: {
    run: { id: string; score: number | null; createdAt: string };
    severity: Record<string, number>;
  };
  to: {
    run: { id: string; score: number | null; createdAt: string };
    severity: Record<string, number>;
  };
  delta: { score: number; issues: number };
  summary: { regressionsCount: number; improvementsCount: number };
  changes: Array<{
    id?: string;
    changeType: string;
    title: string;
    severity: string | null;
    delta: number | null;
  }>;
}

export interface ProjectExport {
  id: string;
  kind: string;
  format: string;
  status: string;
  createdAt: string;
  fileName: string | null;
}

export interface TrendPoint {
  id: string;
  timestamp: string;
  score: number | null;
  categoryScores: Record<string, number> | null;
  scoreDelta: number | null;
}

export interface ExportPayload {
  kind: string;
  auditRunId?: string;
  comparisonId?: string;
  filters?: Record<string, unknown>;
}
