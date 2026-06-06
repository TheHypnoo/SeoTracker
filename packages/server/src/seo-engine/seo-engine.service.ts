import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IssueCode, Severity } from '@seotracker/shared-types';
import { load } from 'cheerio';

import { normalizeDomain } from '../common/utils/domain';
import { readBodyWithLimit, safeFetch, SsrfBlockedError } from '../common/utils/safe-fetch';
import { computeCrawlConfidence } from './crawl-confidence';
import type { Env } from '../config/env.schema';
import { runBlogChecks } from './content-checks';
import { runCrossPageChecks } from './cross-page-checks';
import { analyzeHomepageHtml } from './homepage-html-analyzer';
import { buildIndexabilityMatrix } from './indexability-analyzer';
import { buildLinkGraph } from './link-graph';
import { crawlPages } from './page-crawler';
import { getIssueCategory, scoreAudit } from './scoring';
import type {
  SeoAuditResult,
  SeoEngineTelemetryEvent,
  SeoIssue,
  SeoMetric,
  SeoPageResult,
} from './seo-engine.types';
import { discoverSiteMetadata } from './sitemap-discovery';
import { safeResolveUrl } from './url-utils';

// User-Agent comes from env (AUDIT_USER_AGENT) so it can point at a real
// contact URL per deployment instead of the unresolvable seotracker.local
// placeholder some servers reject as a bot heuristic.

/**
 * Top-level SEO audit orchestrator.
 *
 * The heavy lifting lives in single-purpose modules under this folder:
 *  - homepage-html-analyzer: meta / heading / OG / JSON-LD / mixed content
 *  - sitemap-discovery: favicon, robots.txt, soft-404, sitemap probing
 *  - link-graph: builds depth-1 candidate set from <a> + sitemap entries
 *  - page-crawler: crawls depth-1 (+ optional depth-2) and HEADs the rest
 *  - cross-page-checks: duplicate / thin content over the crawled corpus
 *  - scoring: turns the issue list + page list into a final score
 *
 * This class is a thin coordinator: fetch homepage, fan out, collect, score.
 */
// Mirrors MAX_HTML_BYTES in crawler.ts: enough for any real homepage, small
// enough that a hostile/oversized response can't blow the heap.
const MAX_HOMEPAGE_HTML_BYTES = 5 * 1024 * 1024;

@Injectable()
export class SeoEngineService {
  private readonly logger = new Logger(SeoEngineService.name);

  constructor(private readonly configService: ConfigService<Env, true>) {}

  async analyzeDomain(
    domain: string,
    overrides?: {
      maxPages?: number;
      maxDepth?: number;
      userAgent?: string | null;
    },
  ): Promise<SeoAuditResult> {
    const { homepageUrl } = normalizeDomain(domain);
    const timeoutMs = this.configService.get('AUDIT_HTTP_TIMEOUT_MS', { infer: true });
    const maxLinks = this.configService.get('AUDIT_MAX_LINKS', { infer: true });
    const maxPages: number =
      overrides?.maxPages ?? (this.configService.get('AUDIT_MAX_PAGES', { infer: true }) as number);
    const maxDepth: number =
      overrides?.maxDepth ?? (this.configService.get('AUDIT_MAX_DEPTH', { infer: true }) as number);
    const sitemapSampleMax = this.configService.get('AUDIT_SITEMAP_SAMPLE_MAX', { infer: true });
    const configuredUserAgent = this.configService.get('AUDIT_USER_AGENT', { infer: true });
    const userAgent: string =
      overrides?.userAgent ??
      configuredUserAgent ??
      'SEOTrackerBot/1.0 (+https://github.com/TheHypnoo/SeoTracker)';

    const issues: SeoIssue[] = [];
    const metrics: SeoMetric[] = [];
    const pages: SeoPageResult[] = [];
    const pageTexts: Array<{ url: string; text: string }> = [];
    const telemetry: SeoEngineTelemetryEvent[] = [];

    // ── Step 1: fetch the homepage ───────────────────────────────────────
    let response: Response;
    let responseMs: number;
    let html: string;
    const homepageFetchStart = performance.now();
    try {
      const startedAt = performance.now();
      response = await safeFetch(homepageUrl, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      responseMs = Math.round(performance.now() - startedAt);
      // Bound the body: fetch transparently decompresses gzip, so a small
      // response can expand to GBs (decompression bomb) and OOM the worker.
      // readBodyWithLimit counts decompressed bytes and aborts past the cap.
      html = await readBodyWithLimit(response, MAX_HOMEPAGE_HTML_BYTES);
      pushTelemetry(telemetry, homepageFetchStart, 'homepage_fetch', 'success', {
        bytes: html.length,
        finalUrl: response.url || homepageUrl,
        statusCode: response.status,
        timeoutMs,
      });
    } catch (error) {
      const reason =
        error instanceof SsrfBlockedError ? 'SSRF guard blocked redirect' : String(error);
      this.logger.warn(`Main fetch failed (${reason})`);
      pushTelemetry(telemetry, homepageFetchStart, 'homepage_fetch', 'error', undefined, reason);
      issues.push({
        issueCode: IssueCode.DOMAIN_UNREACHABLE,
        category: getIssueCategory(IssueCode.DOMAIN_UNREACHABLE),
        severity: Severity.CRITICAL,
        message:
          error instanceof SsrfBlockedError
            ? `Domain redirected to a blocked host: ${domain}`
            : `Domain unreachable: ${domain}`,
      });

      const scoringStart = performance.now();
      const fallback = scoreAudit(issues, pages, homepageUrl, metrics);
      pushTelemetry(telemetry, scoringStart, 'scoring', 'success', {
        criticalRisk: fallback.criticalRisk,
        publicScore: fallback.score,
        seoScore: fallback.seoScore,
      });
      return {
        crawlConfidenceScore: fallback.crawlConfidenceScore,
        criticalRisk: fallback.criticalRisk,
        engineTelemetry: telemetry,
        categoryScores: fallback.categoryScores,
        issues,
        metrics,
        pages,
        score: fallback.score,
        scoreBreakdown: fallback.breakdown,
        scoringModelVersion: fallback.modelVersion,
        seoScore: fallback.seoScore,
        urlInspections: [],
      };
    }

    const status = response.status;
    const contentType = response.headers.get('content-type') ?? undefined;
    const homepagePage: SeoPageResult = {
      contentType,
      responseMs,
      source: 'homepage',
      statusCode: status,
      url: homepageUrl,
      xRobotsTag: response.headers.get('x-robots-tag')?.toLowerCase() ?? undefined,
    };
    pages.push(homepagePage);
    metrics.push({ key: 'http_status', valueNum: status });
    metrics.push({ key: 'response_ms', valueNum: responseMs });
    metrics.push({ key: 'html_bytes', valueNum: html.length });

    // ── Step 2: parse + run static HTML analysis ─────────────────────────
    const htmlAnalysisStart = performance.now();
    const $ = load(html);
    const homepageCanonical = $('link[rel="canonical"]').first().attr('href')?.trim();
    homepagePage.canonicalUrl = homepageCanonical
      ? safeResolveUrl(homepageCanonical, response.url || homepageUrl)
      : undefined;
    homepagePage.robotsDirective =
      $('meta[name="robots"]').attr('content')?.toLowerCase() || undefined;
    const htmlAnalysis = analyzeHomepageHtml({ $, response, html, homepageUrl });
    issues.push(...htmlAnalysis.issues);
    metrics.push(...htmlAnalysis.metrics);
    pageTexts.push({ url: homepageUrl, text: htmlAnalysis.homepageText });
    pushTelemetry(telemetry, htmlAnalysisStart, 'html_analysis', 'success', {
      issuesFound: htmlAnalysis.issues.length,
      metricsFound: htmlAnalysis.metrics.length,
      textLength: htmlAnalysis.homepageText.length,
    });

    // Blog-style checks live in their own module; orchestrator just folds them in.
    const blogChecksStart = performance.now();
    const blogIssuesBefore = issues.length;
    for (const issue of runBlogChecks(homepageUrl, $, htmlAnalysis.homepageText)) {
      issues.push(issue);
    }
    pushTelemetry(telemetry, blogChecksStart, 'blog_content_checks', 'success', {
      issuesFound: issues.length - blogIssuesBefore,
    });

    // ── Step 3: discovery (favicon, robots, soft-404, sitemap) ──────────
    const hasFaviconLink =
      $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0;

    const discoveryStart = performance.now();
    const discovery = await discoverSiteMetadata({
      homepageUrl,
      $,
      hasFaviconLink,
      timeoutMs,
      userAgent,
      sitemapSampleMax,
    });
    issues.push(...discovery.issues);
    metrics.push(...discovery.metrics);
    pages.push(...discovery.pages);
    pushTelemetry(telemetry, discoveryStart, 'site_discovery', 'success', {
      issuesFound: discovery.issues.length,
      pagesDiscovered: discovery.pages.length,
      sitemapDiscoveryStatus: discovery.sitemapDiscoveryStatus,
      sitemapUrls: discovery.sitemapUrls.length,
    });

    // ── Step 4: build link graph ────────────────────────────────────────
    const linkGraphStart = performance.now();
    const linkGraph = buildLinkGraph({
      $,
      homepageUrl,
      effectiveHomepageUrl: response.url || homepageUrl,
      sitemapUrls: discovery.sitemapUrls,
      maxLinks,
      maxPages,
      maxDepth,
    });
    metrics.push(...linkGraph.metrics);
    pushTelemetry(telemetry, linkGraphStart, 'link_graph', 'success', {
      crawlCandidates: linkGraph.crawlCandidateCount,
      depth1Selected: linkGraph.depth1Selected.length,
      externalLinks: linkGraph.externalLinks.length,
      remainingInternal: linkGraph.remainingInternal.length,
    });

    // ── Step 5: crawl pages (depth-1 + optional depth-2 + HEAD checks) ──
    const crawlStart = performance.now();
    const crawl = await crawlPages({
      homepageKey: linkGraph.homepageKey,
      depth1Selected: linkGraph.depth1Selected,
      remainingInternal: linkGraph.remainingInternal,
      externalLinks: linkGraph.externalLinks,
      maxDepth,
      maxPages,
      timeoutMs,
      userAgent,
    });
    issues.push(...crawl.issues);
    metrics.push(...crawl.metrics);
    pages.push(...crawl.pages);
    pageTexts.push(...crawl.pageTexts);
    pushTelemetry(telemetry, crawlStart, 'crawl_pages', 'success', {
      issuesFound: crawl.issues.length,
      pagesChecked: crawl.pages.length,
      textsCollected: crawl.pageTexts.length,
      totalAnalyzed: crawl.totalAnalyzed,
    });
    const analyzedPages = pages[0] ? [pages[0], ...crawl.pages] : crawl.pages;
    const confidenceStart = performance.now();
    const confidenceMetrics = computeCrawlConfidence({
      analyzedPages,
      crawlCandidateCount: linkGraph.crawlCandidateCount,
      maxDepth,
      maxPages,
      sitemapDiscoveryStatus: discovery.sitemapDiscoveryStatus,
      sitemapUrls: discovery.sitemapUrls,
      totalAnalyzed: crawl.totalAnalyzed,
    });
    metrics.push(...confidenceMetrics);
    pushTelemetry(telemetry, confidenceStart, 'crawl_confidence', 'success', {
      confidenceLevel: confidenceMetrics.find((metric) => metric.key === 'crawl_confidence_level')
        ?.valueText,
      confidenceScore: confidenceMetrics.find((metric) => metric.key === 'crawl_confidence_score')
        ?.valueNum,
    });

    // ── Step 6: cross-page (duplicates / thin content) ──────────────────
    const crossPageStart = performance.now();
    const cross = runCrossPageChecks({ pageTexts });
    issues.push(...cross.issues);
    metrics.push(...cross.metrics);
    pushTelemetry(telemetry, crossPageStart, 'cross_page_checks', 'success', {
      issuesFound: cross.issues.length,
      metricsFound: cross.metrics.length,
      pagesCompared: pageTexts.length,
    });
    const indexabilityStart = performance.now();
    const urlInspections = buildIndexabilityMatrix({
      homepageUrl,
      issues,
      pages: analyzedPages,
      sitemapUrls: discovery.sitemapUrls,
    });
    pushTelemetry(telemetry, indexabilityStart, 'indexability_matrix', 'success', {
      inspections: urlInspections.length,
    });

    // ── Step 7: score ───────────────────────────────────────────────────
    const scoringStart = performance.now();
    const scored = scoreAudit(issues, pages, homepageUrl, metrics);
    pushTelemetry(telemetry, scoringStart, 'scoring', 'success', {
      criticalRisk: scored.criticalRisk,
      publicScore: scored.score,
      seoScore: scored.seoScore,
      topDeductions: scored.breakdown.topDeductions.map((deduction) => ({
        issueCode: deduction.issueCode,
        points: deduction.cappedDeduction,
      })),
    });

    return {
      crawlConfidenceScore: scored.crawlConfidenceScore,
      criticalRisk: scored.criticalRisk,
      engineTelemetry: telemetry,
      httpStatus: status,
      categoryScores: scored.categoryScores,
      issues,
      metrics,
      pages: pages.map((p) => ({ ...p, score: scored.pageScores.get(p.url) })),
      responseMs,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      scoringModelVersion: scored.modelVersion,
      seoScore: scored.seoScore,
      urlInspections,
    };
  }
}

function pushTelemetry(
  telemetry: SeoEngineTelemetryEvent[],
  startedAt: number,
  stage: string,
  status: SeoEngineTelemetryEvent['status'],
  details?: Record<string, unknown>,
  error?: string,
) {
  telemetry.push({
    details,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    error,
    stage,
    status,
  });
}
