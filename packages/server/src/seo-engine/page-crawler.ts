import { IssueCode, Severity } from '@seotracker/shared-types';

import { analyzeInternalPage, existsUrl } from './crawler';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoMetric, SeoPageResult } from './seo-engine.types';
import { normalizeForComparison, stratifiedSample } from './url-utils';

export type CrawlCollected = {
  issues: SeoIssue[];
  metrics: SeoMetric[];
  pages: SeoPageResult[];
  pageTexts: Array<{ url: string; text: string }>;
  /** Total number of pages analyzed (homepage + depth-1 + depth-2). */
  totalAnalyzed: number;
};

type CrawlInput = {
  homepageKey: string;
  depth1Selected: string[];
  remainingInternal: string[];
  externalLinks: string[];
  maxDepth: number;
  maxPages: number;
  timeoutMs: number;
  userAgent: string;
};

function brokenLinkIssue(url: string, statusCode?: number): SeoIssue {
  return {
    issueCode: IssueCode.BROKEN_LINK,
    category: getIssueCategory(IssueCode.BROKEN_LINK),
    severity: Severity.LOW,
    message: `Broken link detected: ${url}`,
    resourceUrl: url,
    meta: { statusCode },
  };
}

/**
 * Crawl the link graph in two passes:
 *  - depth-1: full GET + analyze the selected internal links.
 *  - depth-2 (only when `maxDepth >= 2`): seed from depth-1 outgoing links,
 *    pick `maxPages - depth1.length` via stratified sampling, full-fetch each.
 *
 * After both passes runs HEAD checks on the remaining (non-crawled) internal
 * links + all external links to surface broken outbound references without
 * paying for full GETs.
 *
 * The function is otherwise a faithful extraction of what `analyzeDomain`
 * used to do inline; mutates nothing externally — returns a single bag of
 * issues / pages / metrics for the caller to merge.
 */
export async function crawlPages(input: CrawlInput): Promise<CrawlCollected> {
  const {
    homepageKey,
    depth1Selected,
    remainingInternal,
    externalLinks,
    maxDepth,
    maxPages,
    timeoutMs,
    userAgent,
  } = input;

  const issues: SeoIssue[] = [];
  const metrics: SeoMetric[] = [];
  const pages: SeoPageResult[] = [];
  const pageTexts: Array<{ url: string; text: string }> = [];
  const visited = new Set<string>([homepageKey]);
  for (const url of depth1Selected) visited.add(normalizeForComparison(url));

  const depth1Results = await Promise.all(
    depth1Selected.map(async (pageUrl) => {
      const pageResult = await analyzeInternalPage(pageUrl, timeoutMs, userAgent);
      pages.push(pageResult.page);
      if (pageResult.page.statusCode && pageResult.page.statusCode >= 400) {
        issues.push(brokenLinkIssue(pageUrl, pageResult.page.statusCode));
        return pageResult;
      }
      for (const issue of pageResult.issues) issues.push(issue);
      if (pageResult.text) pageTexts.push({ url: pageUrl, text: pageResult.text });
      return pageResult;
    }),
  );

  let depth2Analyzed = 0;
  if (maxDepth >= 2) {
    const depth2Budget = Math.max(0, maxPages - depth1Selected.length);
    if (depth2Budget > 0) {
      const depth2CandidateSeen = new Set<string>();
      const depth2Candidates: string[] = [];
      for (const res of depth1Results) {
        if (!res?.links) continue;
        for (const link of res.links) {
          if (visited.has(normalizeForComparison(link))) continue;
          if (depth2CandidateSeen.has(link)) continue;
          depth2CandidateSeen.add(link);
          depth2Candidates.push(link);
        }
      }
      const depth2Selected = stratifiedSample(depth2Candidates, depth2Budget);
      for (const url of depth2Selected) visited.add(normalizeForComparison(url));
      await Promise.all(
        depth2Selected.map(async (pageUrl) => {
          const pageResult = await analyzeInternalPage(pageUrl, timeoutMs, userAgent);
          pages.push(pageResult.page);
          if (pageResult.page.statusCode && pageResult.page.statusCode >= 400) {
            issues.push(brokenLinkIssue(pageUrl, pageResult.page.statusCode));
            return;
          }
          for (const issue of pageResult.issues) issues.push(issue);
          if (pageResult.text) pageTexts.push({ url: pageUrl, text: pageResult.text });
        }),
      );
      depth2Analyzed = depth2Selected.length;
      metrics.push({ key: 'depth2_pages_analyzed', valueNum: depth2Analyzed });
    }
  }

  const totalAnalyzed = 1 + depth1Selected.length + depth2Analyzed;
  metrics.push({ key: 'pages_analyzed', valueNum: totalAnalyzed });

  // HEAD-only checks for links we did NOT crawl, to surface broken outbound
  // references without spending a full GET.
  const headCheckLinks = [...remainingInternal, ...externalLinks];
  await Promise.all(
    headCheckLinks.map(async (link) => {
      const check = await existsUrl(link, timeoutMs, userAgent);
      pages.push(check.page);
      if (!check.exists) {
        issues.push(brokenLinkIssue(link, check.statusCode));
      }
    }),
  );

  return { issues, metrics, pages, pageTexts, totalAnalyzed };
}
