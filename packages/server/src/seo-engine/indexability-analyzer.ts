import { IndexabilityStatus, IssueCode } from '@seotracker/shared-types';

import type { SeoIssue, SeoPageResult, SeoUrlInspection } from './seo-engine.types';
import { normalizeForComparison } from './url-utils';
import { isExpectedNoindexUrl } from './url-policy';

export type BuildIndexabilityInput = {
  homepageUrl: string;
  pages: SeoPageResult[];
  issues: SeoIssue[];
  sitemapUrls: string[];
};

export function buildIndexabilityMatrix(input: BuildIndexabilityInput): SeoUrlInspection[] {
  const { homepageUrl, pages, issues, sitemapUrls } = input;
  const sitemapSet = new Set(sitemapUrls.map(normalizeForComparison));
  const robotsBlocksAll = issues.some(
    (issue) => issue.issueCode === IssueCode.ROBOTS_DISALLOWS_ALL,
  );
  const byUrl = new Map<string, SeoUrlInspection>();

  for (const page of pages) {
    const key = normalizeForComparison(page.url);
    if (byUrl.has(key)) {
      const existing = byUrl.get(key)!;
      byUrl.set(key, mergeInspection(existing, inspectPage(page, sitemapSet, robotsBlocksAll)));
      continue;
    }
    byUrl.set(key, inspectPage(page, sitemapSet, robotsBlocksAll));
  }

  for (const sitemapUrl of sitemapUrls) {
    const key = normalizeForComparison(sitemapUrl);
    if (byUrl.has(key)) {
      const existing = byUrl.get(key)!;
      byUrl.set(key, {
        ...existing,
        sitemapIncluded: true,
        evidence: { ...existing.evidence, sitemapIncluded: true },
      });
      continue;
    }
    const status = isExpectedNoindexUrl(sitemapUrl)
      ? IndexabilityStatus.PRIVATE_EXPECTED
      : IndexabilityStatus.UNKNOWN;
    byUrl.set(key, {
      evidence: {
        reason:
          status === IndexabilityStatus.PRIVATE_EXPECTED
            ? 'URL privada incluida en sitemap; no debería priorizarse para SEO público.'
            : 'URL encontrada en sitemap pero no rastreada dentro del presupuesto actual.',
        sitemapIncluded: true,
      },
      indexabilityStatus: status,
      sitemapIncluded: true,
      source: 'sitemap',
      url: sitemapUrl,
    });
  }

  const homepageKey = normalizeForComparison(homepageUrl);
  return [...byUrl.values()].toSorted((left, right) => {
    if (normalizeForComparison(left.url) === homepageKey) return -1;
    if (normalizeForComparison(right.url) === homepageKey) return 1;
    return left.url.localeCompare(right.url);
  });
}

function inspectPage(
  page: SeoPageResult,
  sitemapSet: ReadonlySet<string>,
  robotsBlocksAll: boolean,
): SeoUrlInspection {
  const robotsDirective = page.robotsDirective?.toLowerCase();
  const xRobotsTag = page.xRobotsTag?.toLowerCase();
  const canonicalUrl = page.canonicalUrl;
  const sitemapIncluded = sitemapSet.has(normalizeForComparison(page.url));
  const status = resolveStatus(page, robotsBlocksAll);

  return {
    canonicalUrl,
    evidence: {
      canonicalUrl,
      reason: explainStatus(status, page, robotsBlocksAll),
      robotsDirective,
      sitemapIncluded,
      source: page.source ?? 'crawl',
      statusCode: page.statusCode,
      xRobotsTag,
    },
    indexabilityStatus: status,
    robotsDirective,
    sitemapIncluded,
    source: page.source ?? 'crawl',
    statusCode: page.statusCode,
    url: page.url,
    xRobotsTag,
  };
}

function resolveStatus(page: SeoPageResult, robotsBlocksAll: boolean): IndexabilityStatus {
  if (isExpectedNoindexUrl(page.url)) {
    return IndexabilityStatus.PRIVATE_EXPECTED;
  }

  if (robotsBlocksAll) {
    return IndexabilityStatus.BLOCKED_BY_ROBOTS;
  }

  const statusCode = page.statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    return IndexabilityStatus.HTTP_ERROR;
  }

  const robotsDirective = page.robotsDirective?.toLowerCase() ?? '';
  const xRobotsTag = page.xRobotsTag?.toLowerCase() ?? '';
  if (robotsDirective.includes('noindex') || xRobotsTag.includes('noindex')) {
    return IndexabilityStatus.NOINDEX;
  }

  if (
    page.canonicalUrl &&
    normalizeForComparison(page.canonicalUrl) !== normalizeForComparison(page.url)
  ) {
    return IndexabilityStatus.CANONICALIZED;
  }

  if (typeof statusCode === 'number' && statusCode > 0 && statusCode < 400) {
    return IndexabilityStatus.INDEXABLE;
  }

  return IndexabilityStatus.UNKNOWN;
}

function explainStatus(
  status: IndexabilityStatus,
  page: SeoPageResult,
  robotsBlocksAll: boolean,
): string {
  if (status === IndexabilityStatus.PRIVATE_EXPECTED) {
    return 'Ruta privada o transaccional; noindex se considera esperado.';
  }
  if (robotsBlocksAll) {
    return 'robots.txt bloquea el rastreo global del sitio.';
  }
  if (status === IndexabilityStatus.HTTP_ERROR) {
    return `La URL responde con HTTP ${page.statusCode}.`;
  }
  if (status === IndexabilityStatus.NOINDEX) {
    return 'La URL declara noindex mediante meta robots o X-Robots-Tag.';
  }
  if (status === IndexabilityStatus.CANONICALIZED) {
    return 'La URL canoniza hacia otra URL.';
  }
  if (status === IndexabilityStatus.INDEXABLE) {
    return 'La URL responde correctamente y no declara bloqueos de indexación.';
  }
  return 'No hay suficiente información para clasificar esta URL.';
}

function mergeInspection(left: SeoUrlInspection, right: SeoUrlInspection): SeoUrlInspection {
  const preferred = sourceRank(right.source) > sourceRank(left.source) ? right : left;
  const fallback = preferred === left ? right : left;
  return {
    ...preferred,
    canonicalUrl: preferred.canonicalUrl ?? fallback.canonicalUrl,
    evidence: { ...fallback.evidence, ...preferred.evidence },
    robotsDirective: preferred.robotsDirective ?? fallback.robotsDirective,
    sitemapIncluded: left.sitemapIncluded || right.sitemapIncluded,
    statusCode: preferred.statusCode ?? fallback.statusCode,
    xRobotsTag: preferred.xRobotsTag ?? fallback.xRobotsTag,
  };
}

function sourceRank(source: SeoUrlInspection['source']): number {
  if (source === 'homepage') return 5;
  if (source === 'crawl') return 4;
  if (source === 'head') return 3;
  if (source === 'sitemap') return 2;
  return 1;
}
