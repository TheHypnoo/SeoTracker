import { IssueCode, Severity } from '@seotracker/shared-types';
import type { CheerioAPI } from 'cheerio';

import { detectHeadingSkips, extractTextForComparison, findMixedContent } from './content-utils';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoMetric } from './seo-engine.types';
import { normalizeForComparison, safeResolveUrl } from './url-utils';

export const COMPRESSION_MIN_BYTES = 20_000;
export const PAGE_TOO_HEAVY_BYTES = 1_500_000;
export const DOM_TOO_LARGE_NODES = 1500;

export type HomepageHtmlAnalysis = {
  /** Plain-text body of the homepage, useful for downstream similarity checks. */
  homepageText: string;
  issues: SeoIssue[];
  metrics: SeoMetric[];
};

type AnalyzeInput = {
  $: CheerioAPI;
  response: Response;
  html: string;
  homepageUrl: string;
};

/**
 * Analyze the homepage HTML for the static set of SEO checks: HTTP-level
 * headers (HTTPS / HSTS / compression / page weight), DOM size, head metadata
 * (title / description / h1 / heading hierarchy / canonical / viewport / lang
 * / robots), images, social tags (OG / Twitter), structured data and mixed
 * content.
 *
 * Pure function: takes a parsed Cheerio root + response + raw html, returns
 * `{ issues, metrics, homepageText }`. The orchestrator (SeoEngineService)
 * composes this with crawling + scoring.
 *
 * Tested in isolation in homepage-html-analyzer.spec.ts.
 */
export function analyzeHomepageHtml(input: AnalyzeInput): HomepageHtmlAnalysis {
  const { $, response, html, homepageUrl } = input;
  const issues: SeoIssue[] = [];
  const metrics: SeoMetric[] = [];

  // ── HTTP-level headers (HTTPS / HSTS / redirect / compression / size) ──
  const status = response.status;
  const finalUrl = response.url || homepageUrl;
  const hstsHeader = response.headers.get('strict-transport-security');

  if (status >= 500) {
    issues.push({
      issueCode: IssueCode.DOMAIN_UNREACHABLE,
      category: getIssueCategory(IssueCode.DOMAIN_UNREACHABLE),
      severity: Severity.CRITICAL,
      message: `HTTP status ${status}`,
    });
  }

  if (!homepageUrl.startsWith('https://')) {
    issues.push({
      issueCode: IssueCode.NO_HTTPS,
      category: getIssueCategory(IssueCode.NO_HTTPS),
      severity: Severity.HIGH,
      message: 'Site is not served over HTTPS',
    });
  } else if (!hstsHeader) {
    issues.push({
      issueCode: IssueCode.MISSING_HSTS,
      category: getIssueCategory(IssueCode.MISSING_HSTS),
      severity: Severity.LOW,
      message: 'Missing Strict-Transport-Security header',
    });
  }

  if (
    response.redirected ||
    normalizeForComparison(finalUrl) !== normalizeForComparison(homepageUrl)
  ) {
    issues.push({
      issueCode: IssueCode.REDIRECT_CHAIN,
      category: getIssueCategory(IssueCode.REDIRECT_CHAIN),
      severity: Severity.LOW,
      message: `Homepage redirects to ${finalUrl}`,
      meta: { from: homepageUrl, to: finalUrl },
    });
  }

  const contentEncoding = response.headers.get('content-encoding')?.toLowerCase() ?? '';
  if (html.length > COMPRESSION_MIN_BYTES && !/\b(gzip|br|deflate|zstd)\b/.test(contentEncoding)) {
    issues.push({
      issueCode: IssueCode.MISSING_COMPRESSION,
      category: getIssueCategory(IssueCode.MISSING_COMPRESSION),
      severity: Severity.MEDIUM,
      message: 'Response is not compressed (no gzip/br/deflate)',
      meta: { bytes: html.length },
    });
  }

  if (html.length > PAGE_TOO_HEAVY_BYTES) {
    issues.push({
      issueCode: IssueCode.PAGE_TOO_HEAVY,
      category: getIssueCategory(IssueCode.PAGE_TOO_HEAVY),
      severity: Severity.MEDIUM,
      message: `HTML payload is ${(html.length / 1024).toFixed(0)} KB (recommended < 1.5 MB)`,
      meta: { bytes: html.length },
    });
  }

  // ── DOM size ───────────────────────────────────────────────────────────
  const homepageText = extractTextForComparison($);
  const domNodeCount = $('*').length;
  metrics.push({ key: 'dom_nodes', valueNum: domNodeCount });
  if (domNodeCount > DOM_TOO_LARGE_NODES) {
    issues.push({
      issueCode: IssueCode.DOM_TOO_LARGE,
      category: getIssueCategory(IssueCode.DOM_TOO_LARGE),
      severity: Severity.LOW,
      message: `DOM has ${domNodeCount} nodes (recommended < 1500)`,
      meta: { nodes: domNodeCount },
    });
  }

  // ── Head meta ──────────────────────────────────────────────────────────
  const titleText = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const h1Count = $('h1').length;
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;
  const canonical = $('link[rel="canonical"]').attr('href');
  const imagesWithoutAlt = $('img')
    .toArray()
    .filter((img) => !$(img).attr('alt')?.trim());

  if (!titleText) {
    issues.push({
      issueCode: IssueCode.MISSING_TITLE,
      category: getIssueCategory(IssueCode.MISSING_TITLE),
      severity: Severity.HIGH,
      message: 'Missing <title> tag',
    });
  } else if (titleText.length < 30) {
    issues.push({
      issueCode: IssueCode.TITLE_TOO_SHORT,
      category: getIssueCategory(IssueCode.TITLE_TOO_SHORT),
      severity: Severity.LOW,
      message: `Title too short (${titleText.length} chars, recommended 30-60)`,
      meta: { length: titleText.length },
    });
  } else if (titleText.length > 60) {
    issues.push({
      issueCode: IssueCode.TITLE_TOO_LONG,
      category: getIssueCategory(IssueCode.TITLE_TOO_LONG),
      severity: Severity.LOW,
      message: `Title too long (${titleText.length} chars, recommended 30-60)`,
      meta: { length: titleText.length },
    });
  }

  if (!metaDescription) {
    issues.push({
      issueCode: IssueCode.MISSING_META_DESCRIPTION,
      category: getIssueCategory(IssueCode.MISSING_META_DESCRIPTION),
      severity: Severity.MEDIUM,
      message: 'Missing meta description',
    });
  } else if (metaDescription.length < 120) {
    issues.push({
      issueCode: IssueCode.META_DESCRIPTION_TOO_SHORT,
      category: getIssueCategory(IssueCode.META_DESCRIPTION_TOO_SHORT),
      severity: Severity.LOW,
      message: `Meta description too short (${metaDescription.length} chars, recommended 120-160)`,
      meta: { length: metaDescription.length },
    });
  } else if (metaDescription.length > 160) {
    issues.push({
      issueCode: IssueCode.META_DESCRIPTION_TOO_LONG,
      category: getIssueCategory(IssueCode.META_DESCRIPTION_TOO_LONG),
      severity: Severity.LOW,
      message: `Meta description too long (${metaDescription.length} chars, recommended 120-160)`,
      meta: { length: metaDescription.length },
    });
  }

  if (h1Count === 0) {
    issues.push({
      issueCode: IssueCode.MISSING_H1,
      category: getIssueCategory(IssueCode.MISSING_H1),
      severity: Severity.HIGH,
      message: 'No H1 tag found',
    });
  }
  if (h1Count > 1) {
    issues.push({
      issueCode: IssueCode.MULTIPLE_H1,
      category: getIssueCategory(IssueCode.MULTIPLE_H1),
      severity: Severity.MEDIUM,
      message: 'Multiple H1 tags found',
      meta: { count: h1Count },
    });
  }

  const headingSkips = detectHeadingSkips($);
  if (headingSkips.length > 0) {
    issues.push({
      issueCode: IssueCode.HEADING_HIERARCHY_SKIP,
      category: getIssueCategory(IssueCode.HEADING_HIERARCHY_SKIP),
      severity: Severity.LOW,
      message: `Heading hierarchy skips detected (${headingSkips.length})`,
      meta: { skips: headingSkips },
    });
  }

  if (!canonical) {
    issues.push({
      issueCode: IssueCode.MISSING_CANONICAL,
      category: getIssueCategory(IssueCode.MISSING_CANONICAL),
      severity: Severity.MEDIUM,
      message: 'Missing canonical tag',
    });
  } else {
    const canonicalResolved = safeResolveUrl(canonical, homepageUrl);
    const actualUrl = response.url || homepageUrl;
    if (
      canonicalResolved &&
      normalizeForComparison(canonicalResolved) !== normalizeForComparison(actualUrl)
    ) {
      issues.push({
        issueCode: IssueCode.CANONICAL_MISMATCH,
        category: getIssueCategory(IssueCode.CANONICAL_MISMATCH),
        severity: Severity.LOW,
        message: 'Canonical points to a different URL than the page itself',
        meta: { canonical: canonicalResolved, page: actualUrl },
      });
    }
  }

  if (imagesWithoutAlt.length > 0) {
    issues.push({
      issueCode: IssueCode.IMAGE_WITHOUT_ALT,
      category: getIssueCategory(IssueCode.IMAGE_WITHOUT_ALT),
      severity: Severity.LOW,
      message: `${imagesWithoutAlt.length} images without alt attribute`,
      meta: { count: imagesWithoutAlt.length },
    });
  }

  const viewport = $('meta[name="viewport"]').attr('content')?.trim();
  if (!viewport) {
    issues.push({
      issueCode: IssueCode.MISSING_VIEWPORT,
      category: getIssueCategory(IssueCode.MISSING_VIEWPORT),
      severity: Severity.HIGH,
      message: 'Missing <meta name="viewport"> (mobile rendering)',
    });
  }

  const htmlLang = $('html').attr('lang')?.trim();
  if (!htmlLang) {
    issues.push({
      issueCode: IssueCode.MISSING_LANG,
      category: getIssueCategory(IssueCode.MISSING_LANG),
      severity: Severity.LOW,
      message: 'Missing lang attribute on <html>',
    });
  }

  const metaRobots = $('meta[name="robots"]').attr('content')?.toLowerCase() ?? '';
  if (metaRobots.includes('noindex')) {
    issues.push({
      issueCode: IssueCode.META_NOINDEX,
      category: getIssueCategory(IssueCode.META_NOINDEX),
      severity: Severity.CRITICAL,
      message:
        'Homepage has <meta name="robots" content="noindex"> — search engines will not index it',
      meta: { content: metaRobots },
    });
  }
  if (metaRobots.includes('nofollow')) {
    issues.push({
      issueCode: IssueCode.META_NOFOLLOW,
      category: getIssueCategory(IssueCode.META_NOFOLLOW),
      severity: Severity.MEDIUM,
      message: 'Homepage has nofollow directive — outgoing links will not be followed',
      meta: { content: metaRobots },
    });
  }

  const hreflangCount = $('link[rel="alternate"][hreflang]').length;
  metrics.push({ key: 'hreflang_tags', valueNum: hreflangCount });

  // ── Image lazy loading ────────────────────────────────────────────────
  const imgCount = $('img').length;
  const lazyImgCount = $('img[loading="lazy"]').length;
  if (imgCount >= 10 && lazyImgCount / imgCount < 0.3) {
    issues.push({
      issueCode: IssueCode.NO_LAZY_IMAGES,
      category: getIssueCategory(IssueCode.NO_LAZY_IMAGES),
      severity: Severity.LOW,
      message: `Only ${lazyImgCount}/${imgCount} images use loading="lazy"`,
      meta: { total: imgCount, lazy: lazyImgCount },
    });
  }

  // ── Open Graph / Twitter ──────────────────────────────────────────────
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
  const ogDescription = $('meta[property="og:description"]').attr('content')?.trim();
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim();
  if (!ogTitle || !ogDescription || !ogImage) {
    const missing = [
      !ogTitle && 'og:title',
      !ogDescription && 'og:description',
      !ogImage && 'og:image',
    ].filter(Boolean);
    issues.push({
      issueCode: IssueCode.MISSING_OPEN_GRAPH,
      category: getIssueCategory(IssueCode.MISSING_OPEN_GRAPH),
      severity: Severity.LOW,
      message: `Missing Open Graph tags: ${missing.join(', ')}`,
      meta: { missing },
    });
  }

  const twitterCard = $('meta[name="twitter:card"]').attr('content')?.trim();
  if (!twitterCard) {
    issues.push({
      issueCode: IssueCode.MISSING_TWITTER_CARD,
      category: getIssueCategory(IssueCode.MISSING_TWITTER_CARD),
      severity: Severity.LOW,
      message: 'Missing Twitter Card meta tag',
    });
  }

  // ── JSON-LD structured data ───────────────────────────────────────────
  const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
  if (jsonLdScripts.length === 0) {
    issues.push({
      issueCode: IssueCode.MISSING_STRUCTURED_DATA,
      category: getIssueCategory(IssueCode.MISSING_STRUCTURED_DATA),
      severity: Severity.LOW,
      message: 'No structured data (JSON-LD) found',
    });
  } else {
    const invalidBlocks: number[] = [];
    for (const [index, node] of jsonLdScripts.entries()) {
      const raw = $(node).contents().text().trim();
      if (!raw) continue;
      try {
        JSON.parse(raw);
      } catch {
        invalidBlocks.push(index);
      }
    }
    if (invalidBlocks.length > 0) {
      issues.push({
        issueCode: IssueCode.INVALID_STRUCTURED_DATA,
        category: getIssueCategory(IssueCode.INVALID_STRUCTURED_DATA),
        severity: Severity.MEDIUM,
        message: `Invalid JSON-LD blocks (${invalidBlocks.length}/${jsonLdScripts.length})`,
        meta: { invalidCount: invalidBlocks.length, total: jsonLdScripts.length },
      });
    }
  }

  // ── Mixed content (HTTPS only) ────────────────────────────────────────
  if (homepageUrl.startsWith('https://')) {
    const insecureResources = findMixedContent($);
    if (insecureResources.length > 0) {
      issues.push({
        issueCode: IssueCode.MIXED_CONTENT,
        category: getIssueCategory(IssueCode.MIXED_CONTENT),
        severity: Severity.MEDIUM,
        message: `Mixed content: ${insecureResources.length} insecure resource(s) loaded over HTTP`,
        meta: { count: insecureResources.length, samples: insecureResources.slice(0, 5) },
      });
    }
  }

  // ── Aggregate metrics ─────────────────────────────────────────────────
  metrics.push({ key: 'title_length', valueNum: titleText.length });
  metrics.push({ key: 'meta_description_length', valueNum: metaDescription.length });
  metrics.push({ key: 'h1_count', valueNum: h1Count });
  metrics.push({ key: 'h2_count', valueNum: h2Count });
  metrics.push({ key: 'h3_count', valueNum: h3Count });
  metrics.push({ key: 'images_without_alt', valueNum: imagesWithoutAlt.length });
  metrics.push({ key: 'json_ld_blocks', valueNum: jsonLdScripts.length });

  return { homepageText, issues, metrics };
}
