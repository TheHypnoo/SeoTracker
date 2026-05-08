import type { ReactNode } from 'react';

export type DashboardPayload = {
  project: {
    id: string;
    name: string;
  };
  summary: {
    activeProjects: number;
    totalAudits: number;
    averageScore: number | null;
    criticalIssues: number;
    regressions: number;
    activeAutomations: number;
  };
  trend: Array<{
    date: string;
    score: number;
    siteDomain?: string;
    siteId?: string;
    siteName?: string;
  }>;
  recentProjects: Array<{
    id: string;
    name: string;
    domain: string;
    latestScore: number | null;
    latestAuditAt: string | null;
  }>;
  recentAudits: Array<{
    id: string;
    siteId: string;
    projectName: string;
    status: string;
    score: number | null;
    createdAt: string;
    issuesCount: number;
  }>;
  activity: Array<{
    kind: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
};

export type MetricTone = 'sky' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';

export type MetricItem = {
  icon: ReactNode;
  label: string;
  value: string;
  suffix?: string;
  tone: MetricTone;
};
