import {
  IssueCategory,
  IssueCode,
  SeoActionEffort,
  SeoActionImpact,
  Severity,
} from '@seotracker/shared-types';

import { getIssueDefinition } from '../seo-engine/issue-definitions';
import type { SeoActionItem, SeoIssue } from '../seo-engine/seo-engine.types';
import { ACTION_COPY, CATEGORY_LABEL, buildRemediationPrompt } from './seo-action-plan.service';

type BuildActionItemsInput = {
  issues: SeoIssue[];
  run: { id: string; score: number | null };
  site: { domain: string; name: string };
};

type ActionAccumulator = {
  issueCode: IssueCode;
  category: IssueCategory;
  severity: Severity;
  message: string;
  occurrences: number;
  affectedPages: Set<string>;
  evidenceSamples: string[];
};

const SEVERITY_PRIORITY: Record<Severity, number> = {
  [Severity.CRITICAL]: 100,
  [Severity.HIGH]: 70,
  [Severity.MEDIUM]: 40,
  [Severity.LOW]: 15,
};

const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.CRITICAL]: 4,
  [Severity.HIGH]: 3,
  [Severity.MEDIUM]: 2,
  [Severity.LOW]: 1,
};

export function buildAuditActionItems(input: BuildActionItemsInput): SeoActionItem[] {
  const grouped = new Map<IssueCode, ActionAccumulator>();

  for (const issue of input.issues) {
    const existing = grouped.get(issue.issueCode);
    const evidence = summarizeIssueEvidence(issue);
    if (existing) {
      existing.occurrences += 1;
      existing.affectedPages.add(issue.resourceUrl ?? '');
      if (evidence && existing.evidenceSamples.length < 3) existing.evidenceSamples.push(evidence);
      if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = issue.severity;
        existing.message = issue.message;
      }
      continue;
    }

    grouped.set(issue.issueCode, {
      affectedPages: new Set([issue.resourceUrl ?? '']),
      category: issue.category,
      evidenceSamples: evidence ? [evidence] : [],
      issueCode: issue.issueCode,
      message: issue.message,
      occurrences: 1,
      severity: issue.severity,
    });
  }

  return [...grouped.values()]
    .map((entry) => toActionItem(entry, input.site, input.run))
    .toSorted((left, right) => right.priorityScore - left.priorityScore);
}

function toActionItem(
  entry: ActionAccumulator,
  site: BuildActionItemsInput['site'],
  run: BuildActionItemsInput['run'],
): SeoActionItem {
  const affectedPages = [...entry.affectedPages].filter(Boolean);
  const definition = getIssueDefinition(entry.issueCode);
  const scoreImpactPoints = Math.round(
    Math.min(
      definition.baseDeduction + definition.repeatIncrement * Math.max(0, entry.occurrences - 1),
      definition.maxDeduction,
    ),
  );
  const priorityScore = Math.max(
    0,
    SEVERITY_PRIORITY[entry.severity] +
      scoreImpactPoints * 3 +
      Math.min(entry.occurrences * 2, 30) +
      Math.min(affectedPages.length * 3, 20),
  );
  const recommendedAction =
    ACTION_COPY[entry.issueCode] ??
    `Resolver "${entry.message}" en las URLs afectadas y validar de nuevo.`;
  const title = humanizeIssueCode(entry.issueCode);

  return {
    affectedPages: affectedPages.slice(0, 8),
    affectedPagesCount: affectedPages.length,
    category: entry.category,
    effort: estimateEffort(affectedPages.length, entry.category),
    evidenceSummary: buildEvidenceSummary(entry),
    impact: estimateImpact(entry.severity, scoreImpactPoints),
    issueCode: entry.issueCode,
    occurrences: entry.occurrences,
    priorityReason: buildPriorityReason(entry.severity, scoreImpactPoints, entry.occurrences),
    priorityScore,
    recommendedAction,
    remediationPrompt: buildRemediationPrompt({
      affectedPages,
      categoryLabel: CATEGORY_LABEL[entry.category],
      issueCode: entry.issueCode,
      message: entry.message,
      occurrences: entry.occurrences,
      recommendedAction,
      run,
      severity: entry.severity,
      site,
      title,
    }),
    scoreImpactPoints,
    severity: entry.severity,
  };
}

function summarizeIssueEvidence(issue: SeoIssue): string | null {
  const meta = issue.meta ?? {};
  if (typeof meta.source === 'string' && typeof meta.content === 'string') {
    return `${meta.source}: ${meta.content}`;
  }
  if (typeof meta.length === 'number') {
    return `Longitud detectada: ${meta.length}`;
  }
  if (typeof meta.canonical === 'string') {
    return `Canonical detectado: ${meta.canonical}`;
  }
  if (typeof meta.statusCode === 'number') {
    return `HTTP ${meta.statusCode}`;
  }
  if (typeof meta.count === 'number') {
    return `Elementos afectados: ${meta.count}`;
  }
  if (typeof meta.bytes === 'number') {
    return `Peso detectado: ${Math.round(meta.bytes / 1024)} KB`;
  }
  if (typeof meta.nodes === 'number') {
    return `Nodos DOM detectados: ${meta.nodes}`;
  }
  if (typeof meta.found === 'string') {
    return `Valor detectado: ${meta.found.slice(0, 120)}`;
  }
  return issue.resourceUrl ? `URL afectada: ${issue.resourceUrl}` : null;
}

function buildEvidenceSummary(entry: ActionAccumulator): string {
  if (entry.evidenceSamples.length > 0) {
    return entry.evidenceSamples.join(' · ');
  }
  return entry.message;
}

function buildPriorityReason(severity: Severity, scoreImpactPoints: number, occurrences: number) {
  return `${severityLabel(severity)} · impacto estimado ${scoreImpactPoints} pts · ${occurrences} ocurrencias`;
}

function estimateImpact(severity: Severity, scoreImpactPoints: number): SeoActionImpact {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH || scoreImpactPoints >= 10) {
    return SeoActionImpact.HIGH;
  }
  if (severity === Severity.MEDIUM || scoreImpactPoints >= 5) {
    return SeoActionImpact.MEDIUM;
  }
  return SeoActionImpact.LOW;
}

function estimateEffort(affectedPages: number, category: IssueCategory): SeoActionEffort {
  if (affectedPages > 10 || category === IssueCategory.PERFORMANCE) {
    return SeoActionEffort.HIGH;
  }
  if (affectedPages > 3 || category === IssueCategory.CRAWLABILITY) {
    return SeoActionEffort.MEDIUM;
  }
  return SeoActionEffort.LOW;
}

function severityLabel(severity: Severity): string {
  if (severity === Severity.CRITICAL) return 'Crítica';
  if (severity === Severity.HIGH) return 'Alta';
  if (severity === Severity.MEDIUM) return 'Media';
  return 'Baja';
}

function humanizeIssueCode(issueCode: IssueCode): string {
  return issueCode
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
