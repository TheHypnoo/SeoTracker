import { IssueCode, Severity } from '@seotracker/shared-types';

import { countWords, detectDuplicateContent } from './content-utils';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoMetric } from './seo-engine.types';

export const DUPLICATE_CONTENT_THRESHOLD = 0.85;
export const THIN_CONTENT_THRESHOLD = 100;

export type CrossPageInput = {
  pageTexts: Array<{ url: string; text: string }>;
  /** Override the default similarity threshold (jaccard 0..1). */
  duplicateThreshold?: number;
  /** Override the minimum word count below which a page is "thin". */
  thinContentThreshold?: number;
};

export type CrossPageResult = {
  issues: SeoIssue[];
  metrics: SeoMetric[];
};

/**
 * Cross-page checks once everything has been crawled: duplicate content
 * (jaccard similarity over shingles) and thin-content per page.
 */
export function runCrossPageChecks(input: CrossPageInput): CrossPageResult {
  const {
    pageTexts,
    duplicateThreshold = DUPLICATE_CONTENT_THRESHOLD,
    thinContentThreshold = THIN_CONTENT_THRESHOLD,
  } = input;
  const issues: SeoIssue[] = [];
  const metrics: SeoMetric[] = [];

  const duplicatePairs = detectDuplicateContent(pageTexts, duplicateThreshold);
  for (const pair of duplicatePairs) {
    issues.push({
      issueCode: IssueCode.DUPLICATE_CONTENT,
      category: getIssueCategory(IssueCode.DUPLICATE_CONTENT),
      severity: Severity.MEDIUM,
      message: `Duplicate content detected between pages (${Math.round(pair.similarity * 100)}% similar)`,
      resourceUrl: pair.urlA,
      meta: {
        urlA: pair.urlA,
        urlB: pair.urlB,
        similarity: Number(pair.similarity.toFixed(3)),
      },
    });
  }
  metrics.push({ key: 'duplicate_content_pairs', valueNum: duplicatePairs.length });

  for (const { url, text } of pageTexts) {
    const wordCount = countWords(text);
    if (wordCount > 0 && wordCount < thinContentThreshold) {
      issues.push({
        issueCode: IssueCode.THIN_CONTENT,
        category: getIssueCategory(IssueCode.THIN_CONTENT),
        severity: Severity.LOW,
        message: `Thin content: only ${wordCount} words`,
        resourceUrl: url,
        meta: { wordCount },
      });
    }
  }

  return { issues, metrics };
}
