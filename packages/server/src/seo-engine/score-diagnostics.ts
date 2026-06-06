import {
  type FalsePositiveRisk,
  IssueCode,
  type SeoImpactTier,
  Severity,
} from '@seotracker/shared-types';

import { ISSUE_DEFINITIONS, type IssueDefinition, type IssueScoreScope } from './issue-definitions';

export type { FalsePositiveRisk, SeoImpactTier };

export type ScoreReviewMatrixEntry = {
  issueCode: IssueCode;
  category: IssueDefinition['category'];
  scope: IssueScoreScope;
  defaultSeverity: Severity;
  currentWeight: {
    baseDeduction: number;
    repeatIncrement: number;
    maxDeduction: number;
    zeroScore: boolean;
  };
  scoreWeight: {
    baseDeduction: number;
    repeatIncrement: number;
    maxDeduction: number;
  };
  impactTier: SeoImpactTier;
  falsePositiveRisk: FalsePositiveRisk;
  reviewNotes: string;
};

type ScorePolicyOverride = {
  baseDeduction: number;
  repeatIncrement: number;
  maxDeduction: number;
  impactTier: SeoImpactTier;
  falsePositiveRisk: FalsePositiveRisk;
  reviewNotes: string;
};

const DEFAULT_SCORE_BY_SEVERITY: Record<
  Severity,
  Pick<ScorePolicyOverride, 'baseDeduction' | 'repeatIncrement' | 'maxDeduction' | 'impactTier'>
> = {
  [Severity.CRITICAL]: {
    baseDeduction: 24,
    impactTier: 'HIGH',
    maxDeduction: 60,
    repeatIncrement: 6,
  },
  [Severity.HIGH]: {
    baseDeduction: 10,
    impactTier: 'HIGH',
    maxDeduction: 32,
    repeatIncrement: 3,
  },
  [Severity.MEDIUM]: {
    baseDeduction: 5,
    impactTier: 'MEDIUM',
    maxDeduction: 18,
    repeatIncrement: 1.5,
  },
  [Severity.LOW]: {
    baseDeduction: 1.5,
    impactTier: 'LOW',
    maxDeduction: 8,
    repeatIncrement: 0.5,
  },
};

/**
 * Diagnostic matrix used by the active score model.
 *
 * The current model stores only technical weights in `issue-definitions.ts`.
 * This matrix adds product-review context so every IssueCode has an explicit
 * SEO impact tier, false-positive risk and score weight. It is kept in
 * code (rather than a spreadsheet) so tests can guarantee full IssueCode
 * coverage and scoring can consume the same source of truth.
 */
const SCORE_MODEL_OVERRIDES: Partial<Record<IssueCode, ScorePolicyOverride>> = {
  [IssueCode.DOMAIN_UNREACHABLE]: blocking(
    100,
    0,
    100,
    'El sitio no puede auditarse ni posicionar si no responde.',
  ),
  [IssueCode.ROBOTS_DISALLOWS_ALL]: blocking(
    45,
    0,
    45,
    'Bloquea rastreo de buscadores; penalización alta pero no cero si es intencionado.',
  ),
  [IssueCode.META_NOINDEX]: blocking(
    35,
    8,
    65,
    'Noindex impide indexación; crítico cuando afecta páginas candidatas a posicionar.',
  ),
  [IssueCode.NO_HTTPS]: high(12, 0, 12, 'HTTPS es requisito básico de confianza y compatibilidad.'),
  [IssueCode.MISSING_VIEWPORT]: high(
    6,
    1.5,
    16,
    'Impacta experiencia móvil; se modera porque algunas respuestas anti-bot o plantillas parciales disparan falsos positivos.',
    'MEDIUM',
  ),
  [IssueCode.MISSING_TITLE]: high(11, 3, 30, 'El title es una señal on-page primaria.'),
  [IssueCode.MISSING_H1]: high(
    7,
    2,
    20,
    'El H1 ayuda a interpretar intención, pero plantillas modernas pueden variar y el benchmark muestra falsos positivos frecuentes.',
    'MEDIUM',
  ),
  [IssueCode.MULTIPLE_H1]: medium(
    2.5,
    0.75,
    8,
    'Varios H1 pueden ser aceptables en layouts/componentes modernos; penalización moderada tras divergencias con PageSpeed.',
    'HIGH',
  ),
  [IssueCode.MISSING_META_DESCRIPTION]: medium(
    4,
    1,
    14,
    'Afecta CTR más que indexación; no debe dominar el score.',
  ),
  [IssueCode.MISSING_CANONICAL]: medium(
    3.5,
    1,
    10,
    'Reduce ambigüedad de URLs preferidas, pero PageSpeed y benchmark muestran que no debe hundir sitios sanos cuando no hay conflicto explícito.',
    'MEDIUM',
  ),
  [IssueCode.MULTIPLE_CANONICALS]: medium(6, 1.5, 18, 'Puede provocar señales contradictorias.'),
  [IssueCode.CANONICAL_MISMATCH]: medium(
    2.5,
    0.75,
    10,
    'Puede ser correcto en paginación/filtros; requiere cautela y el benchmark PageSpeed mostró falsos positivos en sitios sanos.',
    'HIGH',
  ),
  [IssueCode.DUPLICATE_CONTENT]: medium(
    3,
    1,
    12,
    'Riesgo real, pero depende de intención, plantillas compartidas y canonicalización; se rebaja tras aparecer como principal divergencia frente a PageSpeed.',
    'HIGH',
  ),
  [IssueCode.BROKEN_LINK]: medium(
    2.5,
    1,
    18,
    'Impacta calidad y crawl, pero se acumula gradualmente.',
  ),
  [IssueCode.SOFT_404]: medium(
    2.5,
    0,
    2.5,
    'Heurística sensible a páginas de marketing, SPAs y respuestas parciales; PageSpeed no la confirma y debe tratarse como señal de revisión.',
    'HIGH',
  ),
  [IssueCode.SITEMAP_INVALID]: medium(
    4,
    0,
    4,
    'Ayuda al descubrimiento; no invalida el SEO por sí solo.',
  ),
  [IssueCode.SITEMAP_EMPTY]: medium(4, 0, 4, 'Señal de descubrimiento débil, no bloqueo directo.'),
  [IssueCode.MISSING_SITEMAP]: medium(
    2,
    0,
    2,
    'Útil para discovery; sitios pequeños o sitios con sitemap no descubierto pueden posicionar sin penalización fuerte.',
    'HIGH',
  ),
  [IssueCode.MISSING_ROBOTS]: low(
    1,
    0,
    1,
    'robots.txt ausente no suele ser un problema si el sitio permite rastreo.',
  ),
  [IssueCode.REDIRECT_CHAIN]: cosmetic(
    'El detector actual también captura redirecciones canónicas normales (http→https, apex→www); reportar sin penalizar apenas hasta separar cadenas reales.',
  ),
  [IssueCode.MISSING_HSTS]: low(
    1,
    0,
    1,
    'Hardening recomendado, pero no es una señal SEO principal.',
  ),
  [IssueCode.MISSING_FAVICON]: cosmetic('Favicon mejora marca/UX, no debería penalizar salud SEO.'),
  [IssueCode.MISSING_OPEN_GRAPH]: cosmetic(
    'Open Graph afecta previews sociales, no posicionamiento orgánico directo.',
  ),
  [IssueCode.MISSING_TWITTER_CARD]: cosmetic('Twitter/X Card es señal social, no SEO core.'),
  [IssueCode.META_DESCRIPTION_TOO_SHORT]: low(
    1,
    0.35,
    4,
    'Puede ser correcto según snippet; riesgo alto de falso positivo.',
    'HIGH',
  ),
  [IssueCode.META_DESCRIPTION_TOO_LONG]: low(
    1,
    0.35,
    4,
    'Google puede reescribir snippets; penalización ligera.',
    'HIGH',
  ),
  [IssueCode.TITLE_TOO_SHORT]: low(
    1.5,
    0.5,
    6,
    'Un title corto puede funcionar en marcas fuertes o homepages simples.',
    'MEDIUM',
  ),
  [IssueCode.TITLE_TOO_LONG]: low(
    1.5,
    0.5,
    6,
    'El truncado no siempre implica mala relevancia.',
    'MEDIUM',
  ),
  [IssueCode.NO_LAZY_IMAGES]: cosmetic('Optimización de rendimiento menor si no se mide LCP real.'),
  [IssueCode.IMAGE_WITHOUT_ALT]: low(
    1,
    0.25,
    6,
    'Importante para accesibilidad y búsqueda visual, pero el benchmark muestra alta prevalencia y debe priorizar acciones más que hundir score.',
    'MEDIUM',
  ),
  [IssueCode.IMAGE_MISSING_DIMENSIONS]: low(
    1,
    0.25,
    5,
    'Proxy de CLS/rendimiento; sin Core Web Vitals reales debe ser penalización ligera.',
    'MEDIUM',
  ),
  [IssueCode.DOM_TOO_LARGE]: low(
    1.5,
    0,
    1.5,
    'Señal indirecta de performance; sin CWV no debe castigar fuerte.',
  ),
  [IssueCode.PAGE_TOO_HEAVY]: medium(
    2,
    0,
    2,
    'Peso HTML alto es proxy de rendimiento, no CWV real; PageSpeed/Lighthouse debe calibrar el impacto real.',
    'HIGH',
  ),
  [IssueCode.MISSING_COMPRESSION]: medium(
    3,
    0,
    3,
    'Performance básico; impacto depende de servidor/CDN.',
  ),
  [IssueCode.MISSING_STRUCTURED_DATA]: low(
    1,
    0.5,
    5,
    'Schema no es obligatorio para todos los sitios.',
    'HIGH',
  ),
  [IssueCode.MISSING_ARTICLE_SCHEMA]: low(
    1,
    0.35,
    4,
    'Solo relevante en contenido editorial; muy frecuente en landings y docs que PageSpeed considera sanas.',
    'HIGH',
  ),
  [IssueCode.MISSING_AUTHOR]: low(
    1,
    0.35,
    4,
    'Solo aplica claramente en contenido editorial; no debe penalizar landings o docs genéricas.',
    'HIGH',
  ),
  [IssueCode.SHORT_BLOG_POST]: low(
    1,
    0.35,
    4,
    'La longitud por sí sola no mide cobertura de intención y genera divergencias frente a Lighthouse SEO.',
    'HIGH',
  ),
  [IssueCode.POOR_READABILITY]: low(
    1,
    0.5,
    5,
    'Heurística lingüística sensible a idioma y estilo.',
    'HIGH',
  ),
  [IssueCode.STALE_CONTENT]: low(
    1.5,
    0.5,
    6,
    'La antigüedad puede ser aceptable en contenido evergreen.',
    'MEDIUM',
  ),
  [IssueCode.THIN_CONTENT]: low(
    2,
    0.75,
    10,
    'Thin content depende de intención de la página.',
    'MEDIUM',
  ),
  [IssueCode.AI_CRAWLERS_BLOCKED]: cosmetic(
    'Estrategia de IA, no problema SEO clásico; reportar sin hundir score.',
  ),
};

export const SCORE_REVIEW_MATRIX: ScoreReviewMatrixEntry[] = Object.values(IssueCode).map(
  (issueCode) => {
    const definition = ISSUE_DEFINITIONS[issueCode];
    const fallback = DEFAULT_SCORE_BY_SEVERITY[definition.defaultSeverity];
    const override = SCORE_MODEL_OVERRIDES[issueCode];
    const policy = {
      baseDeduction: fallback.baseDeduction,
      falsePositiveRisk: 'MEDIUM' as FalsePositiveRisk,
      impactTier: fallback.impactTier,
      maxDeduction: fallback.maxDeduction,
      repeatIncrement: fallback.repeatIncrement,
      reviewNotes: 'Peso v2 derivado de severidad actual; pendiente de calibración con telemetría.',
      ...override,
    };

    return {
      category: definition.category,
      currentWeight: {
        baseDeduction: definition.baseDeduction,
        maxDeduction: definition.maxDeduction,
        repeatIncrement: definition.repeatIncrement,
        zeroScore: definition.zeroScore === true,
      },
      defaultSeverity: definition.defaultSeverity,
      falsePositiveRisk: policy.falsePositiveRisk,
      impactTier: policy.impactTier,
      issueCode,
      scoreWeight: {
        baseDeduction: policy.baseDeduction,
        maxDeduction: policy.maxDeduction,
        repeatIncrement: policy.repeatIncrement,
      },
      reviewNotes: policy.reviewNotes,
      scope: definition.scoreScope,
    };
  },
);

export function getScoreReviewEntry(issueCode: IssueCode): ScoreReviewMatrixEntry {
  const entry = SCORE_REVIEW_MATRIX_BY_CODE.get(issueCode);
  if (!entry) {
    throw new Error(`Missing score review entry for ${issueCode}`);
  }
  return entry;
}

const SCORE_REVIEW_MATRIX_BY_CODE = new Map(
  SCORE_REVIEW_MATRIX.map((entry) => [entry.issueCode, entry]),
);

function blocking(
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
  reviewNotes: string,
): ScorePolicyOverride {
  return {
    baseDeduction,
    falsePositiveRisk: 'LOW',
    impactTier: 'BLOCKING',
    maxDeduction,
    repeatIncrement,
    reviewNotes,
  };
}

function high(
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
  reviewNotes: string,
  falsePositiveRisk: FalsePositiveRisk = 'LOW',
): ScorePolicyOverride {
  return {
    baseDeduction,
    falsePositiveRisk,
    impactTier: 'HIGH',
    maxDeduction,
    repeatIncrement,
    reviewNotes,
  };
}

function medium(
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
  reviewNotes: string,
  falsePositiveRisk: FalsePositiveRisk = 'MEDIUM',
): ScorePolicyOverride {
  return {
    baseDeduction,
    falsePositiveRisk,
    impactTier: 'MEDIUM',
    maxDeduction,
    repeatIncrement,
    reviewNotes,
  };
}

function low(
  baseDeduction: number,
  repeatIncrement: number,
  maxDeduction: number,
  reviewNotes: string,
  falsePositiveRisk: FalsePositiveRisk = 'MEDIUM',
): ScorePolicyOverride {
  return {
    baseDeduction,
    falsePositiveRisk,
    impactTier: 'LOW',
    maxDeduction,
    repeatIncrement,
    reviewNotes,
  };
}

function cosmetic(reviewNotes: string): ScorePolicyOverride {
  return {
    baseDeduction: 0.5,
    falsePositiveRisk: 'HIGH',
    impactTier: 'COSMETIC',
    maxDeduction: 2,
    repeatIncrement: 0.25,
    reviewNotes,
  };
}
