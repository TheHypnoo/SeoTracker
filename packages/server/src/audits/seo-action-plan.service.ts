import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditStatus,
  ComparisonChangeType,
  IssueCategory,
  IssueCode,
  IssueState,
  Severity,
} from '@seotracker/shared-types';
import { and, desc, eq, lt } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  auditComparisonChanges,
  auditComparisons,
  auditIssues,
  auditRuns,
  siteIssues,
} from '../database/schema';
import { SitesService } from '../sites/sites.service';
import { ProjectIssuesService } from './site-issues.service';

type AuditRunRow = typeof auditRuns.$inferSelect;
type SiteRow = Awaited<ReturnType<SitesService['getById']>>;
type ActionStatus = IssueState.OPEN | IssueState.IGNORED | IssueState.FIXED;
type ImpactLevel = 'Alto' | 'Medio' | 'Bajo';
type EffortLevel = 'Alto' | 'Medio' | 'Bajo';

const SEVERITY_WEIGHT: Record<Severity, number> = {
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

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  [IssueCategory.ON_PAGE]: 'Contenido on-page',
  [IssueCategory.TECHNICAL]: 'SEO técnico',
  [IssueCategory.CRAWLABILITY]: 'Rastreo e indexación',
  [IssueCategory.MEDIA]: 'Imágenes y medios',
  [IssueCategory.PERFORMANCE]: 'Rendimiento',
};

const ACTION_COPY: Partial<Record<IssueCode, string>> = {
  [IssueCode.DOMAIN_UNREACHABLE]:
    'Restaurar disponibilidad del dominio y validar DNS, TLS y respuesta HTTP.',
  [IssueCode.MISSING_TITLE]: 'Añadir títulos únicos y descriptivos en las páginas afectadas.',
  [IssueCode.TITLE_TOO_SHORT]:
    'Ampliar los títulos para incluir intención de búsqueda y entidad principal.',
  [IssueCode.TITLE_TOO_LONG]: 'Recortar títulos para priorizar la parte visible en resultados.',
  [IssueCode.MISSING_META_DESCRIPTION]:
    'Crear meta descriptions únicas orientadas a CTR para cada URL.',
  [IssueCode.META_DESCRIPTION_TOO_SHORT]:
    'Completar descriptions con beneficio, contexto y llamada a la acción.',
  [IssueCode.META_DESCRIPTION_TOO_LONG]: 'Reducir descriptions para evitar truncados en SERP.',
  [IssueCode.MISSING_H1]: 'Añadir un H1 claro alineado con la intención principal de la página.',
  [IssueCode.MULTIPLE_H1]: 'Consolidar múltiples H1 en una jerarquía semántica clara.',
  [IssueCode.HEADING_HIERARCHY_SKIP]:
    'Reordenar encabezados para mantener una jerarquía H1-H2-H3 coherente.',
  [IssueCode.MISSING_CANONICAL]: 'Definir canonical absoluto hacia la URL preferida.',
  [IssueCode.CANONICAL_MISMATCH]: 'Alinear canonical con la URL indexable esperada.',
  [IssueCode.IMAGE_WITHOUT_ALT]:
    'Añadir textos alternativos útiles a imágenes con valor informativo.',
  [IssueCode.MISSING_ROBOTS]: 'Publicar robots.txt y declarar reglas explícitas de rastreo.',
  [IssueCode.MISSING_SITEMAP]: 'Publicar sitemap XML y enlazarlo desde robots.txt.',
  [IssueCode.BROKEN_LINK]: 'Corregir enlaces rotos o redirigirlos a destinos válidos.',
  [IssueCode.MISSING_VIEWPORT]: 'Añadir viewport responsive para evitar problemas móviles.',
  [IssueCode.MISSING_LANG]: 'Declarar el atributo lang correcto en el HTML.',
  [IssueCode.MISSING_OPEN_GRAPH]: 'Añadir metadatos Open Graph en plantillas compartibles.',
  [IssueCode.MISSING_TWITTER_CARD]: 'Añadir Twitter/X Card para mejorar previews sociales.',
  [IssueCode.MISSING_STRUCTURED_DATA]: 'Añadir schema.org relevante para el tipo de página.',
  [IssueCode.INVALID_STRUCTURED_DATA]: 'Corregir errores de schema y validar rich results.',
  [IssueCode.MIXED_CONTENT]: 'Servir todos los recursos por HTTPS.',
  [IssueCode.NO_HTTPS]: 'Forzar HTTPS con certificado válido y redirección 301.',
  [IssueCode.MISSING_HSTS]: 'Activar HSTS cuando HTTPS esté estable en todo el dominio.',
  [IssueCode.REDIRECT_CHAIN]: 'Reducir cadenas de redirección a un único salto.',
  [IssueCode.ROBOTS_DISALLOWS_ALL]:
    'Eliminar bloqueos globales de robots cuando el sitio deba indexarse.',
  [IssueCode.SITEMAP_EMPTY]: 'Regenerar sitemap con URLs indexables.',
  [IssueCode.SITEMAP_INVALID]: 'Corregir formato y URLs inválidas del sitemap.',
  [IssueCode.MISSING_FAVICON]: 'Añadir favicon estable para mejorar identificación de marca.',
  [IssueCode.PAGE_TOO_HEAVY]: 'Reducir peso de recursos críticos y diferir carga no esencial.',
  [IssueCode.DOM_TOO_LARGE]: 'Simplificar markup y componentes repetitivos pesados.',
  [IssueCode.META_NOINDEX]: 'Retirar noindex en páginas que deban posicionar.',
  [IssueCode.META_NOFOLLOW]:
    'Retirar nofollow cuando los enlaces internos deban transferir señales.',
  [IssueCode.AI_CRAWLERS_BLOCKED]:
    'Revisar bloqueos a crawlers de IA según la estrategia de visibilidad.',
  [IssueCode.SOFT_404]: 'Ajustar contenido o estado HTTP para evitar señales de soft 404.',
  [IssueCode.MISSING_COMPRESSION]: 'Activar Brotli o gzip en HTML, CSS, JS y JSON.',
  [IssueCode.NO_LAZY_IMAGES]: 'Aplicar lazy loading a imágenes fuera del primer viewport.',
  [IssueCode.DUPLICATE_CONTENT]:
    'Consolidar duplicados con canonical, redirecciones o contenido diferencial.',
  [IssueCode.THIN_CONTENT]:
    'Ampliar contenido con intención, entidades, ejemplos y señales de confianza.',
  [IssueCode.MISSING_ARTICLE_SCHEMA]: 'Añadir Article/BlogPosting schema en contenido editorial.',
  [IssueCode.STALE_CONTENT]: 'Actualizar contenido antiguo con datos, fechas y cobertura vigente.',
  [IssueCode.POOR_READABILITY]: 'Reescribir bloques densos para mejorar claridad y escaneo.',
  [IssueCode.SHORT_BLOG_POST]: 'Expandir posts cortos para cubrir la intención principal.',
  [IssueCode.MISSING_AUTHOR]: 'Añadir autoría visible y datos estructurados cuando aplique.',
};

interface ActionAccumulator {
  issueCode: IssueCode;
  category: IssueCategory;
  severity: Severity;
  message: string;
  occurrences: number;
  affectedPages: Set<string>;
  states: Record<ActionStatus, number>;
  regressionCount: number;
}

export interface SeoActionPlanItem {
  id: string;
  issueCode: IssueCode;
  title: string;
  category: IssueCategory;
  categoryLabel: string;
  severity: Severity;
  status: ActionStatus;
  priority: number;
  impact: ImpactLevel;
  effort: EffortLevel;
  estimatedImpactPoints: number;
  occurrences: number;
  affectedPagesCount: number;
  affectedPages: string[];
  regressionCount: number;
  recommendedAction: string;
  remediationPrompt: string;
}

export interface SeoActionPlan {
  site: {
    id: string;
    name: string;
    domain: string;
  };
  audit: {
    id: string;
    status: AuditStatus;
    score: number | null;
    previousScore: number | null;
    scoreDelta: number | null;
    createdAt: Date;
    finishedAt: Date | null;
  };
  executiveSummary: {
    score: number | null;
    scoreDelta: number | null;
    criticalOpenActions: number;
    topRisk: string | null;
    improvementsDetected: number;
    nextBestAction: string | null;
    copyText: string;
  };
  totals: {
    actions: number;
    open: number;
    ignored: number;
    fixed: number;
    affectedPages: number;
    regressions: number;
  };
  actions: SeoActionPlanItem[];
}

@Injectable()
export class SeoActionPlanService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly sitesService: SitesService,
  ) {}

  async getForSite(siteId: string, userId: string): Promise<SeoActionPlan> {
    const site = await this.sitesService.getById(siteId, userId);
    const [latestRun] = await this.db
      .select()
      .from(auditRuns)
      .where(and(eq(auditRuns.siteId, siteId), eq(auditRuns.status, AuditStatus.COMPLETED)))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);

    if (!latestRun) {
      throw new NotFoundException('No completed audit found for this site');
    }

    return this.buildPlan(site, latestRun);
  }

  async getForAudit(auditId: string, userId: string): Promise<SeoActionPlan> {
    const [run] = await this.db.select().from(auditRuns).where(eq(auditRuns.id, auditId)).limit(1);

    if (!run) {
      throw new NotFoundException('Audit not found');
    }

    const site = await this.sitesService.getById(run.siteId, userId);
    return this.buildPlan(site, run);
  }

  private async buildPlan(site: SiteRow, run: AuditRunRow): Promise<SeoActionPlan> {
    const [issues, siteIssueRows, previousRun, comparisonContext] = await Promise.all([
      this.db.select().from(auditIssues).where(eq(auditIssues.auditRunId, run.id)),
      this.db.select().from(siteIssues).where(eq(siteIssues.siteId, site.id)),
      this.db
        .select({ score: auditRuns.score })
        .from(auditRuns)
        .where(
          and(
            eq(auditRuns.siteId, site.id),
            eq(auditRuns.status, AuditStatus.COMPLETED),
            lt(auditRuns.createdAt, run.createdAt),
          ),
        )
        .orderBy(desc(auditRuns.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.loadComparisonContext(site.id, run.id),
    ]);

    const stateByKey = new Map(
      siteIssueRows.map((row) => [`${row.issueCode}::${row.resourceKey}`, row]),
    );
    const regressionsByCode = new Map<IssueCode, number>();

    for (const change of comparisonContext.changes) {
      if (
        change.issueCode &&
        (change.changeType === ComparisonChangeType.NEW_ISSUE ||
          change.changeType === ComparisonChangeType.SEVERITY_REGRESSION)
      ) {
        regressionsByCode.set(change.issueCode, (regressionsByCode.get(change.issueCode) ?? 0) + 1);
      }
    }

    const grouped = new Map<IssueCode, ActionAccumulator>();

    for (const issue of issues) {
      const resourceKey = ProjectIssuesService.fingerprintResource(issue.resourceUrl);
      const stateRow = stateByKey.get(`${issue.issueCode}::${resourceKey}`);
      const state = stateRow?.state ?? IssueState.OPEN;
      const existing = grouped.get(issue.issueCode);

      if (existing) {
        existing.occurrences += 1;
        existing.states[state] += 1;
        existing.affectedPages.add(resourceKey);

        if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[existing.severity]) {
          existing.severity = issue.severity;
          existing.message = issue.message;
        }

        continue;
      }

      grouped.set(issue.issueCode, {
        affectedPages: new Set([resourceKey]),
        category: issue.category,
        issueCode: issue.issueCode,
        message: issue.message,
        occurrences: 1,
        regressionCount: regressionsByCode.get(issue.issueCode) ?? 0,
        severity: issue.severity,
        states: {
          [IssueState.OPEN]: state === IssueState.OPEN ? 1 : 0,
          [IssueState.IGNORED]: state === IssueState.IGNORED ? 1 : 0,
          [IssueState.FIXED]: state === IssueState.FIXED ? 1 : 0,
        },
      });
    }

    const actions = [...grouped.values()]
      .map((entry) => this.toActionPlanItem(entry, site, run))
      .toSorted((left, right) => right.priority - left.priority)
      .slice(0, 12);

    const previousScore = previousRun?.score ?? null;
    const scoreDelta =
      run.score !== null && previousScore !== null ? run.score - previousScore : null;

    const totals = {
      actions: actions.length,
      affectedPages: new Set(actions.flatMap((action) => action.affectedPages)).size,
      fixed: actions.filter((action) => action.status === IssueState.FIXED).length,
      ignored: actions.filter((action) => action.status === IssueState.IGNORED).length,
      open: actions.filter((action) => action.status === IssueState.OPEN).length,
      regressions: comparisonContext.regressionsCount,
    };

    const topAction = actions[0] ?? null;
    const criticalOpenActions = actions.filter(
      (action) => action.severity === Severity.CRITICAL && action.status === IssueState.OPEN,
    ).length;

    const executiveSummary = {
      copyText: this.buildExecutiveCopy({
        site,
        run,
        scoreDelta,
        criticalOpenActions,
        improvementsDetected: comparisonContext.improvementsCount,
        actions,
      }),
      criticalOpenActions,
      improvementsDetected: comparisonContext.improvementsCount,
      nextBestAction: topAction?.recommendedAction ?? null,
      score: run.score,
      scoreDelta,
      topRisk: topAction?.title ?? null,
    };

    return {
      actions,
      audit: {
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
        id: run.id,
        previousScore,
        score: run.score,
        scoreDelta,
        status: run.status,
      },
      executiveSummary,
      site: {
        domain: site.domain,
        id: site.id,
        name: site.name,
      },
      totals,
    };
  }

  private async loadComparisonContext(siteId: string, auditRunId: string) {
    const [comparison] = await this.db
      .select()
      .from(auditComparisons)
      .where(
        and(eq(auditComparisons.siteId, siteId), eq(auditComparisons.targetAuditRunId, auditRunId)),
      )
      .orderBy(desc(auditComparisons.createdAt))
      .limit(1);

    if (!comparison) {
      return { changes: [], improvementsCount: 0, regressionsCount: 0 };
    }

    const changes = await this.db
      .select()
      .from(auditComparisonChanges)
      .where(eq(auditComparisonChanges.comparisonId, comparison.id));

    return {
      changes,
      improvementsCount: comparison.improvementsCount,
      regressionsCount: comparison.regressionsCount,
    };
  }

  private toActionPlanItem(
    entry: ActionAccumulator,
    site: SiteRow,
    run: AuditRunRow,
  ): SeoActionPlanItem {
    const status = resolveActionStatus(entry.states);
    const affectedPages = [...entry.affectedPages].filter(Boolean);
    const priority = Math.max(
      0,
      SEVERITY_WEIGHT[entry.severity] +
        Math.min(entry.occurrences * 2, 30) +
        Math.min(affectedPages.length * 3, 20) +
        entry.regressionCount * 15 -
        (status === IssueState.IGNORED ? 35 : 0) -
        (status === IssueState.FIXED ? 80 : 0),
    );

    const recommendedAction =
      ACTION_COPY[entry.issueCode] ??
      `Resolver "${entry.message}" en las URLs afectadas y validar de nuevo.`;

    return {
      affectedPages: affectedPages.slice(0, 6),
      affectedPagesCount: affectedPages.length,
      category: entry.category,
      categoryLabel: CATEGORY_LABEL[entry.category],
      effort: estimateEffort(affectedPages.length, entry.category),
      estimatedImpactPoints: estimateImpactPoints(entry.severity, affectedPages.length),
      id: entry.issueCode,
      impact: estimateImpact(entry.severity),
      issueCode: entry.issueCode,
      occurrences: entry.occurrences,
      priority,
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
        title: humanizeIssueCode(entry.issueCode),
      }),
      regressionCount: entry.regressionCount,
      severity: entry.severity,
      status,
      title: humanizeIssueCode(entry.issueCode),
    };
  }

  private buildExecutiveCopy(input: {
    site: SiteRow;
    run: AuditRunRow;
    scoreDelta: number | null;
    criticalOpenActions: number;
    improvementsDetected: number;
    actions: SeoActionPlanItem[];
  }) {
    const scoreLine =
      input.scoreDelta === null
        ? `Score actual: ${input.run.score ?? 'N/D'}/100`
        : `Score actual: ${input.run.score ?? 'N/D'}/100 (${formatDelta(input.scoreDelta)})`;
    const nextActions = input.actions
      .slice(0, 3)
      .map((action, index) => `${index + 1}. ${action.title}: ${action.recommendedAction}`)
      .join('\n');

    return [
      `Resumen ejecutivo SEO - ${input.site.name}`,
      `Dominio: ${input.site.domain}`,
      scoreLine,
      `Riesgos críticos abiertos: ${input.criticalOpenActions}`,
      `Mejoras detectadas desde la comparativa: ${input.improvementsDetected}`,
      'Próximas acciones:',
      nextActions || 'Sin incidencias abiertas en la auditoría seleccionada.',
    ].join('\n');
  }
}

export function buildRemediationPrompt(input: {
  affectedPages: string[];
  categoryLabel: string;
  issueCode: IssueCode;
  message: string;
  occurrences: number;
  recommendedAction: string;
  run: Pick<AuditRunRow, 'id' | 'score'>;
  severity: Severity;
  site: Pick<SiteRow, 'domain' | 'name'>;
  title: string;
}) {
  const urls =
    input.affectedPages.length > 0
      ? input.affectedPages
          .slice(0, 8)
          .map((url, index) => `${index + 1}. ${url}`)
          .join('\n')
      : 'Sin URL concreta; revisa la configuración global del dominio.';

  return [
    'Actúa como especialista en SEO técnico y desarrollo web.',
    '',
    'Contexto:',
    `- Dominio: ${input.site.domain}`,
    `- Proyecto: ${input.site.name}`,
    `- Auditoría: ${input.run.id}`,
    `- Score actual: ${input.run.score ?? 'N/D'}/100`,
    `- Incidencia: ${input.title} (${input.issueCode})`,
    `- Severidad: ${input.severity}`,
    `- Categoría: ${input.categoryLabel}`,
    `- Ocurrencias: ${input.occurrences}`,
    `- Mensaje detectado: ${input.message}`,
    '',
    'URLs afectadas:',
    urls,
    '',
    'Objetivo:',
    input.recommendedAction,
    '',
    'Entrega una solución práctica con:',
    '1. Causa probable del problema.',
    '2. Cambios concretos en HTML, CMS, servidor, CDN o código según aplique.',
    '3. Ejemplos de implementación cuando sea útil.',
    '4. Checklist de validación para confirmar que el error desaparece en la próxima auditoría.',
    '',
    'Prioriza cambios seguros, reversibles y medibles. No propongas acciones genéricas si la evidencia permite una corrección concreta.',
  ].join('\n');
}

function resolveActionStatus(states: Record<ActionStatus, number>): ActionStatus {
  if (states[IssueState.OPEN] > 0) {
    return IssueState.OPEN;
  }

  if (states[IssueState.IGNORED] > 0) {
    return IssueState.IGNORED;
  }

  return IssueState.FIXED;
}

function humanizeIssueCode(issueCode: IssueCode): string {
  return issueCode
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function estimateImpact(severity: Severity): ImpactLevel {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH) {
    return 'Alto';
  }

  return severity === Severity.MEDIUM ? 'Medio' : 'Bajo';
}

function estimateEffort(affectedPages: number, category: IssueCategory): EffortLevel {
  if (affectedPages > 10 || category === IssueCategory.PERFORMANCE) {
    return 'Alto';
  }

  if (affectedPages > 3 || category === IssueCategory.CRAWLABILITY) {
    return 'Medio';
  }

  return 'Bajo';
}

function estimateImpactPoints(severity: Severity, affectedPages: number): number {
  const base =
    severity === Severity.CRITICAL
      ? 12
      : severity === Severity.HIGH
        ? 8
        : severity === Severity.MEDIUM
          ? 4
          : 2;
  return Math.min(base + Math.floor(affectedPages / 3), 18);
}

function formatDelta(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta} pts`;
}
