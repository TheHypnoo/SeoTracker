import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IssueCode, Severity } from '@seotracker/shared-types';
import { load } from 'cheerio';

import { normalizeDomain } from '../common/utils/domain';
import { safeFetch, SsrfBlockedError } from '../common/utils/safe-fetch';
import type { Env } from '../config/env.schema';
import { runBlogChecks } from './content-checks';
import { runCrossPageChecks } from './cross-page-checks';
import { analyzeHomepageHtml } from './homepage-html-analyzer';
import { buildLinkGraph } from './link-graph';
import { crawlPages } from './page-crawler';
import { getIssueCategory, scoreAudit } from './scoring';
import type { SeoAuditResult, SeoIssue, SeoMetric, SeoPageResult } from './seo-engine.types';
import { discoverSiteMetadata } from './sitemap-discovery';

const USER_AGENT = 'SEOTrackerBot/1.0 (+https://seotracker.local)';

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
    void overrides?.userAgent; // reserved for future per-site UA override

    const issues: SeoIssue[] = [];
    const metrics: SeoMetric[] = [];
    const pages: SeoPageResult[] = [];
    const pageTexts: Array<{ url: string; text: string }> = [];

    // ── Step 1: fetch the homepage ───────────────────────────────────────
    let response: Response;
    let responseMs: number;
    try {
      const startedAt = performance.now();
      response = await safeFetch(homepageUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      responseMs = Math.round(performance.now() - startedAt);
    } catch (error) {
      const reason =
        error instanceof SsrfBlockedError ? 'SSRF guard blocked redirect' : String(error);
      this.logger.warn(`Main fetch failed (${reason})`);
      issues.push({
        issueCode: IssueCode.DOMAIN_UNREACHABLE,
        category: getIssueCategory(IssueCode.DOMAIN_UNREACHABLE),
        severity: Severity.CRITICAL,
        message:
          error instanceof SsrfBlockedError
            ? `Domain redirected to a blocked host: ${domain}`
            : `Domain unreachable: ${domain}`,
      });

      const fallback = scoreAudit(issues, pages, homepageUrl);
      return {
        score: fallback.score,
        categoryScores: fallback.categoryScores,
        scoreBreakdown: fallback.breakdown,
        issues,
        metrics,
        pages,
      };
    }

    const status = response.status;
    const contentType = response.headers.get('content-type') ?? undefined;
    const html = await response.text();
    pages.push({ url: homepageUrl, statusCode: status, responseMs, contentType });
    metrics.push({ key: 'http_status', valueNum: status });
    metrics.push({ key: 'response_ms', valueNum: responseMs });
    metrics.push({ key: 'html_bytes', valueNum: html.length });

    // ── Step 2: parse + run static HTML analysis ─────────────────────────
    const $ = load(html);
    const htmlAnalysis = analyzeHomepageHtml({ $, response, html, homepageUrl });
    issues.push(...htmlAnalysis.issues);
    metrics.push(...htmlAnalysis.metrics);
    pageTexts.push({ url: homepageUrl, text: htmlAnalysis.homepageText });

    // Blog-style checks live in their own module; orchestrator just folds them in.
    for (const issue of runBlogChecks(homepageUrl, $, htmlAnalysis.homepageText)) {
      issues.push(issue);
    }

    // ── Step 3: discovery (favicon, robots, soft-404, sitemap) ──────────
    const hasFaviconLink =
      $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0;

    const discovery = await discoverSiteMetadata({
      homepageUrl,
      $,
      hasFaviconLink,
      timeoutMs,
      userAgent: USER_AGENT,
      sitemapSampleMax,
    });
    issues.push(...discovery.issues);
    metrics.push(...discovery.metrics);
    pages.push(...discovery.pages);

    // ── Step 4: build link graph ────────────────────────────────────────
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

    // ── Step 5: crawl pages (depth-1 + optional depth-2 + HEAD checks) ──
    const crawl = await crawlPages({
      homepageKey: linkGraph.homepageKey,
      depth1Selected: linkGraph.depth1Selected,
      remainingInternal: linkGraph.remainingInternal,
      externalLinks: linkGraph.externalLinks,
      maxDepth,
      maxPages,
      timeoutMs,
      userAgent: USER_AGENT,
    });
    issues.push(...crawl.issues);
    metrics.push(...crawl.metrics);
    pages.push(...crawl.pages);
    pageTexts.push(...crawl.pageTexts);

    // ── Step 6: cross-page (duplicates / thin content) ──────────────────
    const cross = runCrossPageChecks({ pageTexts });
    issues.push(...cross.issues);
    metrics.push(...cross.metrics);

    // ── Step 7: score ───────────────────────────────────────────────────
    const scored = scoreAudit(issues, pages, homepageUrl);

    return {
      httpStatus: status,
      responseMs,
      score: scored.score,
      categoryScores: scored.categoryScores,
      scoreBreakdown: scored.breakdown,
      issues,
      metrics,
      pages: pages.map((p) => ({ ...p, score: scored.pageScores.get(p.url) })),
    };
  }
}
