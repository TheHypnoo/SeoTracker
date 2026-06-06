import { IssueCategory, IssueCode, Severity } from '@seotracker/shared-types';

import type { SeoIssue, SeoMetric, SeoPageResult } from './seo-engine.types';

export type ScoreCalibrationFixture = {
  id: string;
  label: string;
  notes: string;
  homepageUrl: string;
  issues: SeoIssue[];
  metrics: SeoMetric[];
  pages: SeoPageResult[];
  expected: {
    seoScoreRange: [number, number];
    criticalRisk: 'NONE' | 'WARNING' | 'BLOCKING';
  };
};

const HOME = 'https://example.test/';

export const SCORE_CALIBRATION_FIXTURES: ScoreCalibrationFixture[] = [
  {
    expected: {
      criticalRisk: 'NONE',
      seoScoreRange: [96, 100],
    },
    homepageUrl: HOME,
    id: 'healthy-marketing-site',
    issues: [
      issue(IssueCode.MISSING_TWITTER_CARD, Severity.LOW),
      issue(IssueCode.MISSING_FAVICON, Severity.LOW),
    ],
    label: 'SEO bueno con señales sociales menores',
    metrics: confidence(88),
    notes: 'Un sitio sano no debe caer por Twitter Card, favicon u otros checks cosméticos.',
    pages: [{ statusCode: 200, url: HOME }],
  },
  {
    expected: {
      criticalRisk: 'NONE',
      seoScoreRange: [82, 98],
    },
    homepageUrl: HOME,
    id: 'basic-blog',
    issues: [
      issue(IssueCode.META_DESCRIPTION_TOO_SHORT, Severity.LOW),
      issue(IssueCode.MISSING_ARTICLE_SCHEMA, Severity.LOW, `${HOME}post/a`),
      issue(IssueCode.SHORT_BLOG_POST, Severity.LOW, `${HOME}post/a`),
    ],
    label: 'Blog básico con oportunidades editoriales',
    metrics: confidence(82),
    notes: 'Las mejoras editoriales deben priorizar acciones, no hundir el score global.',
    pages: [
      { statusCode: 200, url: HOME },
      { statusCode: 200, url: `${HOME}post/a` },
    ],
  },
  {
    expected: {
      criticalRisk: 'NONE',
      seoScoreRange: [75, 92],
    },
    homepageUrl: HOME,
    id: 'ecommerce-large-catalog',
    issues: [
      issue(IssueCode.MISSING_CANONICAL, Severity.MEDIUM, `${HOME}category/shoes`),
      issue(IssueCode.DUPLICATE_CONTENT, Severity.MEDIUM, `${HOME}product/1`),
      issue(IssueCode.BROKEN_LINK, Severity.LOW, `${HOME}old-product`),
    ],
    label: 'Ecommerce con riesgos de catálogo',
    metrics: confidence(76),
    notes: 'Canonicals/duplicados sí importan, pero el peso debe ser gradual.',
    pages: [
      { statusCode: 200, url: HOME },
      { statusCode: 200, url: `${HOME}category/shoes` },
      { statusCode: 404, url: `${HOME}old-product` },
    ],
  },
  {
    expected: {
      criticalRisk: 'BLOCKING',
      seoScoreRange: [35, 65],
    },
    homepageUrl: HOME,
    id: 'homepage-noindex',
    issues: [issue(IssueCode.META_NOINDEX, Severity.CRITICAL, HOME)],
    label: 'Homepage noindex',
    metrics: confidence(90),
    notes: 'Un bloqueo explícito de indexación debe destacar como riesgo crítico.',
    pages: [{ statusCode: 200, url: HOME }],
  },
  {
    expected: {
      criticalRisk: 'NONE',
      seoScoreRange: [85, 98],
    },
    homepageUrl: HOME,
    id: 'low-confidence-spa',
    issues: [
      issue(IssueCode.THIN_CONTENT, Severity.LOW, HOME),
      issue(IssueCode.MISSING_META_DESCRIPTION, Severity.MEDIUM, HOME),
      issue(IssueCode.MISSING_OPEN_GRAPH, Severity.LOW, HOME),
    ],
    label: 'SPA con baja confianza de rastreo',
    metrics: confidence(32),
    notes:
      'Cuando el crawler ve poco contenido, El score reduce penalizaciones no bloqueantes y muestra baja confianza.',
    pages: [{ statusCode: 200, url: HOME }],
  },
  {
    expected: {
      criticalRisk: 'BLOCKING',
      seoScoreRange: [0, 0],
    },
    homepageUrl: HOME,
    id: 'domain-down',
    issues: [issue(IssueCode.DOMAIN_UNREACHABLE, Severity.CRITICAL)],
    label: 'Dominio caído',
    metrics: [],
    notes: 'El único caso calibrado como score cero inmediato.',
    pages: [],
  },
];

function issue(issueCode: IssueCode, severity: Severity, resourceUrl?: string): SeoIssue {
  return {
    category: category(issueCode),
    issueCode,
    message: issueCode,
    resourceUrl,
    severity,
  };
}

function confidence(value: number): SeoMetric[] {
  return [{ key: 'crawl_confidence_score', valueNum: value }];
}

function category(issueCode: IssueCode): IssueCategory {
  if (
    issueCode === IssueCode.DOMAIN_UNREACHABLE ||
    issueCode === IssueCode.NO_HTTPS ||
    issueCode === IssueCode.MISSING_FAVICON
  ) {
    return IssueCategory.TECHNICAL;
  }
  if (issueCode === IssueCode.BROKEN_LINK || issueCode === IssueCode.META_NOINDEX) {
    return IssueCategory.CRAWLABILITY;
  }
  return IssueCategory.ON_PAGE;
}
