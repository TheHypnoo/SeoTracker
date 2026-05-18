import { Inject, Injectable } from '@nestjs/common';
import { ComparisonChangeType, Permission, Severity } from '@seotracker/shared-types';
import { eq } from 'drizzle-orm';

import { assertPresent } from '../common/utils/assert';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { alertRules, auditComparisonChanges } from '../database/schema';
import {
  type AuditRegressionSignal,
  renderAuditRegressionEmail,
} from '../notifications/email-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { SitesService } from '../sites/sites.service';

interface ProjectContext {
  id: string;
  name: string;
  domain: string;
  projectId: string;
}

interface ComparisonSummary {
  id: string;
  scoreDelta: number;
  issuesDelta: number;
  regressionsCount: number;
}

interface RegressionSignalInput {
  issuesDelta: number;
  newCriticalIssuesCount: number;
  notifyOnIssueCountIncrease: boolean;
  notifyOnNewCriticalIssues: boolean;
  notifyOnScoreDrop: boolean;
  scoreDelta: number;
  scoreDropThreshold: number;
}

@Injectable()
export class AlertsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getForProject(siteId: string, userId: string) {
    await this.sitesService.getByIdWithPermission(siteId, userId, Permission.ALERT_READ);
    return this.getOrCreateRule(siteId);
  }

  async updateForProject(
    siteId: string,
    userId: string,
    input: {
      enabled?: boolean;
      notifyOnScoreDrop?: boolean;
      scoreDropThreshold?: number;
      notifyOnNewCriticalIssues?: boolean;
      notifyOnIssueCountIncrease?: boolean;
    },
  ) {
    await this.sitesService.getByIdWithPermission(siteId, userId, Permission.ALERT_WRITE);
    await this.getOrCreateRule(siteId);

    const [saved] = await this.db
      .update(alertRules)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(alertRules.siteId, siteId))
      .returning();

    return assertPresent(saved, 'Alert rule update did not return a row');
  }

  async evaluateRegression(site: ProjectContext, comparison: ComparisonSummary) {
    const rule = await this.getOrCreateRule(site.id);
    if (!rule.enabled) {
      return null;
    }

    const changes = await this.db
      .select()
      .from(auditComparisonChanges)
      .where(eq(auditComparisonChanges.comparisonId, comparison.id));

    const newCriticalIssues = changes.filter(
      (change) =>
        change.changeType === ComparisonChangeType.NEW_ISSUE &&
        change.severity === Severity.CRITICAL,
    );

    const signals = buildAuditRegressionSignals({
      issuesDelta: comparison.issuesDelta,
      newCriticalIssuesCount: newCriticalIssues.length,
      notifyOnIssueCountIncrease: rule.notifyOnIssueCountIncrease,
      notifyOnNewCriticalIssues: rule.notifyOnNewCriticalIssues,
      notifyOnScoreDrop: rule.notifyOnScoreDrop,
      scoreDelta: comparison.scoreDelta,
      scoreDropThreshold: rule.scoreDropThreshold,
    });

    if (!signals.length) {
      return null;
    }

    const title = `Regresión detectada en ${site.name}`;
    const body = formatAuditRegressionNotificationBody(site.domain, signals);

    await this.notificationsService.createForProjectMembers(site.projectId, {
      body,
      title,
      type: 'AUDIT_REGRESSION',
    });
    const email = await renderAuditRegressionEmail({
      domain: site.domain,
      signals,
      siteName: site.name,
    });

    await this.notificationsService.sendEmailToProjectMembers(
      site.projectId,
      {
        html: email.html,
        subject: email.subject,
        text: email.text,
      },
      { bestEffort: true, notificationType: 'AUDIT_REGRESSION' },
    );

    return {
      signals,
      triggered: true,
    };
  }

  private async getOrCreateRule(siteId: string) {
    const [existingRule] = await this.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.siteId, siteId))
      .limit(1);

    if (existingRule) {
      return existingRule;
    }

    const [created] = await this.db
      .insert(alertRules)
      .values({
        siteId,
      })
      .returning();

    return assertPresent(created, 'Alert rule creation did not return a row');
  }
}

export function buildAuditRegressionSignals(input: RegressionSignalInput): AuditRegressionSignal[] {
  const signals: AuditRegressionSignal[] = [];

  if (input.notifyOnScoreDrop && input.scoreDelta <= -input.scoreDropThreshold) {
    const scoreDrop = Math.abs(input.scoreDelta);
    signals.push({
      description: `El score ha bajado ${formatCount(scoreDrop, 'punto', 'puntos')} desde la última auditoría.`,
      detail: `Umbral configurado: ${formatCount(input.scoreDropThreshold, 'punto', 'puntos')}.`,
      title: 'Score SEO en descenso',
      tone: 'danger',
    });
  }

  if (input.notifyOnNewCriticalIssues && input.newCriticalIssuesCount > 0) {
    signals.push({
      description:
        input.newCriticalIssuesCount === 1
          ? 'Se ha detectado 1 incidencia crítica que antes no estaba presente.'
          : `Se han detectado ${input.newCriticalIssuesCount} incidencias críticas que antes no estaban presentes.`,
      title: 'Nuevas incidencias críticas',
      tone: 'danger',
    });
  }

  if (input.notifyOnIssueCountIncrease && input.issuesDelta > 0) {
    signals.push({
      description: `El total de incidencias ha aumentado en ${formatCount(
        input.issuesDelta,
        'incidencia',
        'incidencias',
      )} desde la última auditoría.`,
      title: 'Aumento del volumen de incidencias',
      tone: 'warning',
    });
  }

  return signals;
}

export function formatAuditRegressionNotificationBody(
  domain: string,
  signals: AuditRegressionSignal[],
) {
  const signalSummary = signals.map((signal) => `${signal.title}: ${signal.description}`).join(' ');

  return `Se ha detectado una regresión en ${domain}. ${signalSummary}`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
