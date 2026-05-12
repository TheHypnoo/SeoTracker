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

export interface TrendPoint {
  id: string;
  timestamp: string;
  score: number | null;
  categoryScores: Record<string, number> | null;
  scoreDelta: number | null;
}
