import { IssueCode, Severity } from '@seotracker/shared-types';
import type { CheerioAPI } from 'cheerio';

import {
  analyzeSitemap,
  checkSoft404,
  existsUrl,
  extractSitemapHintsFromHtml,
  extractSitemapUrls,
  fetchRobots,
  probeSitemap,
} from './crawler';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoMetric, SeoPageResult } from './seo-engine.types';
import { stripTrackingParams } from './url-utils';

export type DiscoveryResult = {
  issues: SeoIssue[];
  metrics: SeoMetric[];
  pages: SeoPageResult[];
  /** Sample of URLs harvested from the sitemap (already capped at sample max). */
  sitemapUrls: string[];
};

type DiscoverInput = {
  homepageUrl: string;
  $: CheerioAPI;
  hasFaviconLink: boolean;
  timeoutMs: number;
  userAgent: string;
  sitemapSampleMax: number;
};

/**
 * Discovery layer: favicon probe (when no <link rel="icon"> in HTML),
 * robots.txt parsing (with AI-bot detection + Disallow:/), soft-404 probe,
 * and sitemap discovery from robots.txt + HTML hints + common paths.
 *
 * Extracted from `analyzeDomain` to keep the orchestrator readable. Uses
 * the existing helpers in `./crawler.ts`.
 */
export async function discoverSiteMetadata(input: DiscoverInput): Promise<DiscoveryResult> {
  const { homepageUrl, $, hasFaviconLink, timeoutMs, userAgent, sitemapSampleMax } = input;
  const issues: SeoIssue[] = [];
  const metrics: SeoMetric[] = [];
  const pages: SeoPageResult[] = [];

  // ── Favicon probe (only when no <link rel="icon"> in HTML) ───────────
  if (!hasFaviconLink) {
    const faviconCheck = await existsUrl(`${homepageUrl}/favicon.ico`, timeoutMs, userAgent);
    pages.push(faviconCheck.page);
    if (!faviconCheck.exists) {
      issues.push({
        issueCode: IssueCode.MISSING_FAVICON,
        category: getIssueCategory(IssueCode.MISSING_FAVICON),
        severity: Severity.LOW,
        message: 'No favicon declared and /favicon.ico not found',
      });
    }
  }

  // ── robots.txt ────────────────────────────────────────────────────────
  const robotsUrl = `${homepageUrl}/robots.txt`;
  const robotsResult = await fetchRobots(robotsUrl, timeoutMs, userAgent);
  pages.push(robotsResult.page);
  if (!robotsResult.exists) {
    issues.push({
      issueCode: IssueCode.MISSING_ROBOTS,
      category: getIssueCategory(IssueCode.MISSING_ROBOTS),
      severity: Severity.HIGH,
      message: 'robots.txt not found',
      resourceUrl: robotsUrl,
    });
  } else if (robotsResult.disallowsAll) {
    issues.push({
      issueCode: IssueCode.ROBOTS_DISALLOWS_ALL,
      category: getIssueCategory(IssueCode.ROBOTS_DISALLOWS_ALL),
      severity: Severity.CRITICAL,
      message: 'robots.txt blocks all crawlers (Disallow: / for User-agent: *)',
      resourceUrl: robotsUrl,
    });
  }
  if (robotsResult.blockedAiBots.length > 0) {
    issues.push({
      issueCode: IssueCode.AI_CRAWLERS_BLOCKED,
      category: getIssueCategory(IssueCode.AI_CRAWLERS_BLOCKED),
      severity: Severity.MEDIUM,
      message: `robots.txt blocks AI crawlers: ${robotsResult.blockedAiBots.join(', ')}`,
      resourceUrl: robotsUrl,
      meta: { bots: robotsResult.blockedAiBots },
    });
  }
  metrics.push({ key: 'ai_crawlers_blocked', valueNum: robotsResult.blockedAiBots.length });

  // ── soft-404 probe ────────────────────────────────────────────────────
  const soft404 = await checkSoft404(homepageUrl, timeoutMs, userAgent);
  if (soft404.page) pages.push(soft404.page);
  if (soft404.isSoft404) {
    issues.push({
      issueCode: IssueCode.SOFT_404,
      category: getIssueCategory(IssueCode.SOFT_404),
      severity: Severity.MEDIUM,
      message: 'Nonexistent URL returns HTTP 200 instead of 404 (soft 404)',
      resourceUrl: soft404.probedUrl,
    });
  }

  // ── sitemap discovery ────────────────────────────────────────────────
  const htmlSitemapHints = extractSitemapHintsFromHtml($, homepageUrl);
  const sitemapCandidates = [
    ...robotsResult.sitemaps,
    ...htmlSitemapHints,
    `${homepageUrl}/sitemap.xml`,
    `${homepageUrl}/sitemap_index.xml`,
    `${homepageUrl}/sitemap-index.xml`,
    `${homepageUrl}/sitemap.xml.gz`,
    `${homepageUrl}/sitemap/sitemap.xml`,
    `${homepageUrl}/sitemap/index.xml`,
    `${homepageUrl}/sitemaps/sitemap.xml`,
    `${homepageUrl}/sitemaps.xml`,
    `${homepageUrl}/wp-sitemap.xml`,
    `${homepageUrl}/sitemap1.xml`,
    `${homepageUrl}/sitemap_main.xml`,
    `${homepageUrl}/1_index_sitemap.xml`,
  ];
  const seenSitemap = new Set<string>();
  let sitemapFoundUrl: string | undefined;
  for (const candidate of sitemapCandidates) {
    const normalized = stripTrackingParams(candidate);
    if (seenSitemap.has(normalized)) continue;
    seenSitemap.add(normalized);
    const probe = await probeSitemap(normalized, timeoutMs, userAgent);
    pages.push(probe.page);
    if (probe.isSitemap) {
      sitemapFoundUrl = normalized;
      break;
    }
  }

  let sitemapUrls: string[] = [];
  if (!sitemapFoundUrl) {
    issues.push({
      issueCode: IssueCode.MISSING_SITEMAP,
      category: getIssueCategory(IssueCode.MISSING_SITEMAP),
      severity: Severity.MEDIUM,
      message: 'sitemap not found (checked robots.txt and common paths)',
      resourceUrl: `${homepageUrl}/sitemap.xml`,
    });
  } else {
    const sitemapAnalysis = await analyzeSitemap(sitemapFoundUrl, timeoutMs, userAgent);
    if (sitemapAnalysis.urlCount !== null) {
      metrics.push({ key: 'sitemap_urls', valueNum: sitemapAnalysis.urlCount });
    }
    if (sitemapAnalysis.invalid) {
      issues.push({
        issueCode: IssueCode.SITEMAP_INVALID,
        category: getIssueCategory(IssueCode.SITEMAP_INVALID),
        severity: Severity.MEDIUM,
        message: 'Sitemap could not be parsed as valid XML',
        resourceUrl: sitemapFoundUrl,
      });
    } else if (sitemapAnalysis.urlCount === 0) {
      issues.push({
        issueCode: IssueCode.SITEMAP_EMPTY,
        category: getIssueCategory(IssueCode.SITEMAP_EMPTY),
        severity: Severity.MEDIUM,
        message: 'Sitemap is empty (no <url> or <sitemap> entries)',
        resourceUrl: sitemapFoundUrl,
      });
    } else {
      sitemapUrls = await extractSitemapUrls(
        sitemapFoundUrl,
        timeoutMs,
        userAgent,
        sitemapSampleMax,
      );
    }
  }

  return { issues, metrics, pages, sitemapUrls };
}
