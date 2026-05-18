import type { SeoMetric, SeoPageResult } from './seo-engine.types';

export type CrawlConfidenceInput = {
  maxPages: number;
  maxDepth: number;
  sitemapUrls: string[];
  crawlCandidateCount: number;
  totalAnalyzed: number;
  analyzedPages: SeoPageResult[];
};

export function computeCrawlConfidence(input: CrawlConfidenceInput): SeoMetric[] {
  const { maxPages, maxDepth, sitemapUrls, crawlCandidateCount, totalAnalyzed, analyzedPages } =
    input;
  const expectedInternalPages = Math.max(1, 1 + crawlCandidateCount);
  const coverageRatio = clamp(totalAnalyzed / expectedInternalPages, 0, 1);
  const sampledEnough = maxPages >= expectedInternalPages || coverageRatio >= 0.75;
  const successfulPageRatio = calculateSuccessfulPageRatio(analyzedPages);
  const sitemapSignal = sitemapUrls.length > 0 ? 12 : 0;
  const depthSignal = maxDepth >= 2 && totalAnalyzed > 1 ? 8 : 0;
  const samplingSignal = sampledEnough ? 5 : 0;
  const confidenceScore = Math.round(
    coverageRatio * 60 + successfulPageRatio * 15 + sitemapSignal + depthSignal + samplingSignal,
  );

  return [
    { key: 'crawl_confidence_score', valueNum: clamp(confidenceScore, 0, 100) },
    { key: 'crawl_confidence_level', valueText: confidenceLevel(confidenceScore) },
    { key: 'crawl_coverage_ratio', valueNum: round2(coverageRatio) },
    { key: 'crawl_success_ratio', valueNum: round2(successfulPageRatio) },
    { key: 'crawl_candidates_found', valueNum: crawlCandidateCount },
  ];
}

function calculateSuccessfulPageRatio(pages: SeoPageResult[]): number {
  const pagesWithStatus = pages.filter((page) => typeof page.statusCode === 'number');
  if (pagesWithStatus.length === 0) return 0;
  const successful = pagesWithStatus.filter((page) => {
    const status = page.statusCode ?? 0;
    return status > 0 && status < 400;
  });
  return successful.length / pagesWithStatus.length;
}

function confidenceLevel(score: number): string {
  if (score >= 80) return 'Alta';
  if (score >= 55) return 'Media';
  return 'Baja';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
