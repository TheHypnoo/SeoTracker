import { IssueCode, Severity } from '@seotracker/shared-types';
import type { CheerioAPI } from 'cheerio';

import {
  analyzeAndSampleSitemap,
  checkSoft404,
  existsUrl,
  extractSitemapHintsFromHtml,
  fetchRobots,
  probeSitemap,
} from './crawler';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoMetric, SeoPageResult } from './seo-engine.types';
import { stripTrackingParams } from './url-utils';

const MAX_INCONCLUSIVE_SITEMAP_PROBES = 3;

export type DiscoveryResult = {
  issues: SeoIssue[];
  metrics: SeoMetric[];
  pages: SeoPageResult[];
  /** Sample of URLs harvested from the sitemap (already capped at sample max). */
  sitemapUrls: string[];
  sitemapDiscoveryStatus: 'FOUND' | 'MISSING' | 'INCONCLUSIVE';
  robotsDiscoveryStatus: 'FOUND' | 'MISSING' | 'INCONCLUSIVE';
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
    metrics.push({
      key: 'favicon_probe_status',
      valueText: faviconCheck.status,
    });
    if (faviconCheck.status === 'INCONCLUSIVE' && faviconCheck.errorReason) {
      metrics.push({
        key: 'favicon_probe_inconclusive_reason',
        valueText: faviconCheck.errorReason,
      });
    }
    if (faviconCheck.status === 'MISSING') {
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
  // A transient/inconclusive robots probe must NOT be treated as "missing":
  // emitting MISSING_ROBOTS would penalise real SEO for a timeout. We only
  // lower crawl confidence (mirrors the sitemap INCONCLUSIVE handling below).
  const robotsDiscoveryStatus: 'FOUND' | 'MISSING' | 'INCONCLUSIVE' =
    robotsResult.status === 'INCONCLUSIVE'
      ? 'INCONCLUSIVE'
      : robotsResult.exists
        ? 'FOUND'
        : 'MISSING';
  metrics.push({ key: 'robots_discovery_status', valueText: robotsDiscoveryStatus });
  if (robotsDiscoveryStatus === 'INCONCLUSIVE') {
    if (robotsResult.errorReason) {
      metrics.push({
        key: 'robots_probe_inconclusive_reason',
        valueText: robotsResult.errorReason,
      });
    }
  } else if (robotsDiscoveryStatus === 'MISSING') {
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
  let inconclusiveProbeCount = 0;
  const inconclusiveProbeReasons = new Set<string>();
  for (const candidate of sitemapCandidates) {
    const normalized = stripTrackingParams(candidate);
    if (seenSitemap.has(normalized)) continue;
    seenSitemap.add(normalized);
    const probe = await probeSitemap(normalized, timeoutMs, userAgent);
    pages.push(probe.page);
    if (probe.status === 'inconclusive') {
      inconclusiveProbeCount += 1;
      if (probe.errorReason) {
        inconclusiveProbeReasons.add(probe.errorReason);
      }
      if (inconclusiveProbeCount >= MAX_INCONCLUSIVE_SITEMAP_PROBES) {
        break;
      }
    }
    if (probe.isSitemap) {
      sitemapFoundUrl = normalized;
      break;
    }
  }
  metrics.push({ key: 'sitemap_candidates_checked', valueNum: seenSitemap.size });
  if (inconclusiveProbeCount > 0) {
    metrics.push({ key: 'sitemap_probe_inconclusive_count', valueNum: inconclusiveProbeCount });
    metrics.push({
      key: 'sitemap_probe_inconclusive_reasons',
      valueText: [...inconclusiveProbeReasons].join(',') || 'unknown',
    });
  }

  let sitemapUrls: string[] = [];
  let sitemapDiscoveryStatus: DiscoveryResult['sitemapDiscoveryStatus'];
  if (!sitemapFoundUrl) {
    if (inconclusiveProbeCount > 0) {
      sitemapDiscoveryStatus = 'INCONCLUSIVE';
      metrics.push({ key: 'sitemap_discovery_status', valueText: 'INCONCLUSIVE' });
    } else {
      sitemapDiscoveryStatus = 'MISSING';
      metrics.push({ key: 'sitemap_discovery_status', valueText: 'MISSING' });
      issues.push({
        issueCode: IssueCode.MISSING_SITEMAP,
        category: getIssueCategory(IssueCode.MISSING_SITEMAP),
        severity: Severity.MEDIUM,
        message: 'sitemap not found (checked robots.txt and common paths)',
        resourceUrl: `${homepageUrl}/sitemap.xml`,
      });
    }
  } else {
    sitemapDiscoveryStatus = 'FOUND';
    metrics.push({ key: 'sitemap_discovery_status', valueText: 'FOUND' });
    metrics.push({ key: 'sitemap_found_url', valueText: sitemapFoundUrl });
    // Single fetch: validate the root sitemap and harvest the URL sample in one
    // download instead of analyzing and extracting in two separate GETs.
    const sitemapAnalysis = await analyzeAndSampleSitemap(
      sitemapFoundUrl,
      timeoutMs,
      userAgent,
      sitemapSampleMax,
    );
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
      sitemapUrls = sitemapAnalysis.urls;
    }
  }

  return { issues, metrics, pages, robotsDiscoveryStatus, sitemapDiscoveryStatus, sitemapUrls };
}
