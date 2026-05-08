import { IssueCode, Severity } from '@seotracker/shared-types';
import { load } from 'cheerio';

import { safeFetch } from '../common/utils/safe-fetch';
import { runBlogChecks } from './content-checks';
import { extractTextForComparison } from './content-utils';
import { getIssueCategory } from './scoring';
import type { SeoIssue, SeoPageResult } from './seo-engine.types';
import { normalizeForComparison, safeResolveUrl, stripTrackingParams } from './url-utils';
import { isExpectedNoindexUrl, isSeoCrawlCandidateUrl } from './url-policy';

type Cheerio = ReturnType<typeof load>;

/**
 * Catalogue of well-known AI training crawlers we surface to the user.
 * If `robots.txt` blocks all of these, the site is effectively opting out of
 * AI training datasets, which we report as the `AI_CRAWLERS_BLOCKED` issue.
 * The list is informational only — we don't change our own crawl behaviour
 * based on it (we always identify ourselves as the SEOTracker user-agent).
 */
const AI_BOTS = new Set([
  'gptbot',
  'chatgpt-user',
  'claudebot',
  'anthropic-ai',
  'claude-web',
  'perplexitybot',
  'google-extended',
  'ccbot',
  'applebot-extended',
  'bytespider',
  'amazonbot',
  'cohere-ai',
  'ai2bot',
  'diffbot',
  'img2dataset',
  'omgili',
]);

const MAX_LINKS_PER_PAGE = 40;
const MAX_SITEMAPS_PER_RUN = 8;

export interface RobotsResult {
  exists: boolean;
  sitemaps: string[];
  disallowsAll: boolean;
  blockedAiBots: string[];
  page: SeoPageResult;
}

/**
 * Fetch and parse `robots.txt`. Reports whether the site exists, lists referenced sitemaps,
 * detects a global `Disallow: /`, and tracks which AI crawlers are explicitly blocked.
 * All HTTP traffic goes through `safeFetch` so private IP ranges and internal hosts cannot
 * be reached even if a redirect or user-supplied URL points there (SSRF defence).
 */
export async function fetchRobots(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<RobotsResult> {
  try {
    const startedAt = performance.now();
    const response = await safeFetch(url, {
      headers: { 'User-Agent': userAgent },
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseMs = Math.round(performance.now() - startedAt);
    const page: SeoPageResult = {
      contentType: response.headers.get('content-type') ?? undefined,
      responseMs,
      statusCode: response.status,
      url,
    };

    if (response.status >= 400) {
      return { blockedAiBots: [], disallowsAll: false, exists: false, page, sitemaps: [] };
    }

    const body = await response.text();
    const sitemaps: string[] = [];
    let currentAgents: string[] = [];
    let currentGroupHasDirectives = false;
    let disallowsAll = false;
    const blockedAiBots = new Set<string>();

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) {
        currentAgents = [];
        currentGroupHasDirectives = false;
        continue;
      }
      const sitemapMatch = line.match(/^sitemap\s*:\s*(\S+)/i);
      if (sitemapMatch?.[1]) {
        sitemaps.push(sitemapMatch[1]);
        continue;
      }
      const uaMatch = line.match(/^user-agent\s*:\s*(\S+)/i);
      if (uaMatch?.[1]) {
        const agent = uaMatch[1].toLowerCase();
        if (currentGroupHasDirectives) {
          currentAgents = [agent];
          currentGroupHasDirectives = false;
        } else if (!currentAgents.includes(agent)) {
          currentAgents.push(agent);
        }
        continue;
      }
      const disallowMatch = line.match(/^disallow\s*:\s*(\S*)/i);
      if (disallowMatch) {
        currentGroupHasDirectives = true;
        const path = disallowMatch[1] ?? '';
        for (const agent of currentAgents) {
          if (agent === '*' && path === '/') {
            disallowsAll = true;
          }
          if (AI_BOTS.has(agent) && path === '/') {
            blockedAiBots.add(agent);
          }
        }
        continue;
      }
      if (/^[a-z-]+\s*:/i.test(line) && currentAgents.length > 0) {
        currentGroupHasDirectives = true;
      }
    }

    return {
      blockedAiBots: Array.from(blockedAiBots),
      disallowsAll,
      exists: true,
      page,
      sitemaps,
    };
  } catch {
    return {
      blockedAiBots: [],
      disallowsAll: false,
      exists: false,
      page: { contentType: undefined, responseMs: undefined, statusCode: undefined, url },
      sitemaps: [],
    };
  }
}

export async function checkSoft404(
  homepageUrl: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ isSoft404: boolean; probedUrl?: string; page?: SeoPageResult }> {
  const probedUrl = `${homepageUrl}/__seotracker_nonexistent_${Date.now()}__`;
  try {
    const startedAt = performance.now();
    const response = await safeFetch(probedUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseMs = Math.round(performance.now() - startedAt);
    const page: SeoPageResult = {
      contentType: response.headers.get('content-type') ?? undefined,
      responseMs,
      statusCode: response.status,
      url: probedUrl,
    };
    return { isSoft404: response.status === 200, page, probedUrl };
  } catch {
    return { isSoft404: false, probedUrl };
  }
}

export function extractSitemapHintsFromHtml($: Cheerio, homepageUrl: string): string[] {
  const hints = new Set<string>();
  $('link[rel="sitemap"]').each((_, node) => {
    const href = $(node).attr('href');
    if (!href) {
      return;
    }
    const resolved = safeResolveUrl(href, homepageUrl);
    if (resolved) {
      hints.add(resolved);
    }
  });
  $('a[href]').each((_, node) => {
    const href = $(node).attr('href');
    if (!href) {
      return;
    }
    if (!/sitemap[^/]*\.xml(\.gz)?(\?|$)/i.test(href)) {
      return;
    }
    const resolved = safeResolveUrl(href, homepageUrl);
    if (resolved) {
      hints.add(resolved);
    }
  });
  return [...hints];
}

export async function probeSitemap(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ isSitemap: boolean; page: SeoPageResult }> {
  try {
    const startedAt = performance.now();
    const response = await safeFetch(url, {
      headers: { Accept: 'application/xml, text/xml, */*', 'User-Agent': userAgent },
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseMs = Math.round(performance.now() - startedAt);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const page: SeoPageResult = {
      contentType: contentType || undefined,
      responseMs,
      statusCode: response.status,
      url,
    };
    if (response.status >= 400) {
      return { isSitemap: false, page };
    }
    const snippet = (await response.text()).slice(0, 4096).toLowerCase();
    const looksXml =
      snippet.includes('<urlset') ||
      snippet.includes('<sitemapindex') ||
      (snippet.trimStart().startsWith('<?xml') && snippet.includes('sitemap'));
    return { isSitemap: looksXml, page };
  } catch {
    return {
      isSitemap: false,
      page: { contentType: undefined, responseMs: undefined, statusCode: undefined, url },
    };
  }
}

export async function analyzeSitemap(url: string, timeoutMs: number, userAgent: string) {
  try {
    const response = await safeFetch(url, {
      headers: { 'User-Agent': userAgent },
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 400) {
      return { invalid: false, urlCount: null as number | null };
    }
    const body = await response.text();
    if (body.trim().length === 0) {
      return { invalid: true, urlCount: 0 };
    }
    if (!body.includes('<urlset') && !body.includes('<sitemapindex')) {
      return { invalid: true, urlCount: null as number | null };
    }
    const urlMatches = body.match(/<url\b/gi)?.length ?? 0;
    const sitemapMatches = body.match(/<sitemap\b/gi)?.length ?? 0;
    return { invalid: false, urlCount: urlMatches + sitemapMatches };
  } catch {
    return { invalid: false, urlCount: null as number | null };
  }
}

export async function extractSitemapUrls(
  rootUrl: string,
  timeoutMs: number,
  userAgent: string,
  limit: number,
): Promise<string[]> {
  const collected: string[] = [];
  const seen = new Set<string>();
  const visitedSitemaps = new Set<string>();
  const queue: string[] = [rootUrl];

  while (
    queue.length > 0 &&
    collected.length < limit &&
    visitedSitemaps.size < MAX_SITEMAPS_PER_RUN
  ) {
    const current = queue.shift();
    if (!current || visitedSitemaps.has(current)) {
      continue;
    }
    visitedSitemaps.add(current);
    let body: string;
    try {
      const response = await safeFetch(current, {
        headers: { Accept: 'application/xml, text/xml, */*', 'User-Agent': userAgent },
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 400) {
        continue;
      }
      body = await response.text();
    } catch {
      continue;
    }
    const isIndex = /<sitemapindex\b/i.test(body);
    const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(body)) !== null) {
      const loc = match[1]?.trim();
      if (!loc) {
        continue;
      }
      if (isIndex) {
        if (
          !visitedSitemaps.has(loc) &&
          queue.length + visitedSitemaps.size < MAX_SITEMAPS_PER_RUN
        ) {
          queue.push(loc);
        }
      } else {
        const normalized = stripTrackingParams(loc);
        if (seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        collected.push(normalized);
        if (collected.length >= limit) {
          break;
        }
      }
    }
  }
  return collected;
}

export async function existsUrl(url: string, timeoutMs: number, userAgent: string) {
  try {
    const startedAt = performance.now();
    let response = await safeFetch(url, {
      headers: { 'User-Agent': userAgent },
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 400 || response.status === 405) {
      response = await safeFetch(url, {
        headers: { 'User-Agent': userAgent },
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
    }

    const responseMs = Math.round(performance.now() - startedAt);

    return {
      exists: response.status < 400,
      page: {
        url,
        statusCode: response.status,
        responseMs,
        contentType: response.headers.get('content-type') ?? undefined,
      } satisfies SeoPageResult,
      statusCode: response.status,
    };
  } catch {
    return {
      exists: false,
      page: {
        url,
        statusCode: undefined,
        responseMs: undefined,
        contentType: undefined,
      } satisfies SeoPageResult,
      statusCode: undefined,
    };
  }
}

export function checkCanonicalTags($: Cheerio, pageUrl: string, finalUrl: string): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const canonicalNodes = $('link[rel="canonical"]').toArray();
  const canonical = canonicalNodes[0] ? $(canonicalNodes[0]).attr('href')?.trim() : undefined;

  if (canonicalNodes.length === 0 || !canonical) {
    issues.push({
      category: getIssueCategory(IssueCode.MISSING_CANONICAL),
      issueCode: IssueCode.MISSING_CANONICAL,
      message: 'Missing canonical tag',
      resourceUrl: pageUrl,
      severity: Severity.MEDIUM,
    });
    return issues;
  }

  if (canonicalNodes.length > 1) {
    issues.push({
      category: getIssueCategory(IssueCode.MULTIPLE_CANONICALS),
      issueCode: IssueCode.MULTIPLE_CANONICALS,
      message: `Multiple canonical tags found (${canonicalNodes.length})`,
      meta: { count: canonicalNodes.length },
      resourceUrl: pageUrl,
      severity: Severity.MEDIUM,
    });
  }

  if (!/^https?:\/\//i.test(canonical)) {
    issues.push({
      category: getIssueCategory(IssueCode.CANONICAL_NOT_ABSOLUTE),
      issueCode: IssueCode.CANONICAL_NOT_ABSOLUTE,
      message: 'Canonical URL is not absolute',
      meta: { canonical },
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  const canonicalResolved = safeResolveUrl(canonical, finalUrl);
  if (
    canonicalResolved &&
    normalizeForComparison(canonicalResolved) !== normalizeForComparison(finalUrl)
  ) {
    issues.push({
      category: getIssueCategory(IssueCode.CANONICAL_MISMATCH),
      issueCode: IssueCode.CANONICAL_MISMATCH,
      message: 'Canonical points to a different URL',
      meta: { canonical: canonicalResolved, page: finalUrl },
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  return issues;
}

export function countImagesMissingDimensions($: Cheerio) {
  return $('img')
    .toArray()
    .filter((img) => {
      const width = $(img).attr('width')?.trim();
      const height = $(img).attr('height')?.trim();
      return !isPositiveIntegerAttribute(width) || !isPositiveIntegerAttribute(height);
    }).length;
}

export function findInvalidHreflangLinks($: Cheerio, pageUrl: string) {
  const invalid: Array<{ hreflang: string; href: string; reason: string }> = [];
  const seen = new Set<string>();
  $('link[rel="alternate"][hreflang]').each((_, node) => {
    const hreflang = $(node).attr('hreflang')?.trim() ?? '';
    const href = $(node).attr('href')?.trim() ?? '';
    const normalizedLang = hreflang.toLowerCase();

    if (!/^x-default$|^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(hreflang)) {
      invalid.push({ href, hreflang, reason: 'invalid-lang' });
    }
    if (!safeResolveUrl(href, pageUrl)) {
      invalid.push({ href, hreflang, reason: 'invalid-href' });
    }
    if (seen.has(normalizedLang)) {
      invalid.push({ href, hreflang, reason: 'duplicate-lang' });
    }
    if (normalizedLang) {
      seen.add(normalizedLang);
    }
  });
  return invalid;
}

export function analyzeJsonLdBlocks($: Cheerio) {
  const blocks = $('script[type="application/ld+json"]').toArray();
  const invalidBlocks: number[] = [];
  const missingTypeBlocks: number[] = [];

  for (const [index, node] of blocks.entries()) {
    const raw = $(node).contents().text().trim();
    if (!raw) {
      missingTypeBlocks.push(index);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!jsonLdHasType(parsed)) {
        missingTypeBlocks.push(index);
      }
    } catch {
      invalidBlocks.push(index);
    }
  }

  return { invalidBlocks, missingTypeBlocks, total: blocks.length };
}

function isPositiveIntegerAttribute(value: string | undefined) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function jsonLdHasType(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(jsonLdHasType);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['@type'] === 'string' && record['@type'].trim()) {
    return true;
  }
  if (Array.isArray(record['@graph'])) {
    return record['@graph'].some(jsonLdHasType);
  }
  return false;
}

/**
 * Fetch + run on-page checks (title, description, h1, canonical, alt, robots
 * meta, blog signals) on a single internal URL. Returns the page result, the
 * issues found, the cleaned text (for downstream duplicate-content checks) and
 * the same-host links discovered for further crawling.
 */
export async function analyzeInternalPage(
  pageUrl: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ page: SeoPageResult; issues: SeoIssue[]; text?: string; links?: string[] }> {
  const pageIssues: SeoIssue[] = [];
  let statusCode: number | undefined;
  let responseMs: number | undefined;
  let contentType: string | undefined;

  try {
    const startedAt = performance.now();
    const response = await safeFetch(pageUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    responseMs = Math.round(performance.now() - startedAt);
    statusCode = response.status;
    contentType = response.headers.get('content-type') ?? undefined;

    if (response.status >= 400) {
      return { issues: pageIssues, page: { contentType, responseMs, statusCode, url: pageUrl } };
    }
    if (contentType && !contentType.includes('text/html')) {
      return { issues: pageIssues, page: { contentType, responseMs, statusCode, url: pageUrl } };
    }

    const html = await response.text();
    const $ = load(html);
    const text = extractTextForComparison($);
    const finalUrl = response.url || pageUrl;
    for (const issue of runBlogChecks(pageUrl, $, text)) {
      pageIssues.push(issue);
    }

    const titleText = $('title').first().text().trim();
    if (!titleText) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.MISSING_TITLE),
        issueCode: IssueCode.MISSING_TITLE,
        message: 'Missing <title> tag',
        resourceUrl: pageUrl,
        severity: Severity.HIGH,
      });
    } else if (titleText.length < 30) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.TITLE_TOO_SHORT),
        issueCode: IssueCode.TITLE_TOO_SHORT,
        message: `Title too short (${titleText.length} chars)`,
        meta: { length: titleText.length },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    } else if (titleText.length > 60) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.TITLE_TOO_LONG),
        issueCode: IssueCode.TITLE_TOO_LONG,
        message: `Title too long (${titleText.length} chars)`,
        meta: { length: titleText.length },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }

    const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
    if (!metaDescription) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.MISSING_META_DESCRIPTION),
        issueCode: IssueCode.MISSING_META_DESCRIPTION,
        message: 'Missing meta description',
        resourceUrl: pageUrl,
        severity: Severity.MEDIUM,
      });
    } else if (metaDescription.length < 120) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.META_DESCRIPTION_TOO_SHORT),
        issueCode: IssueCode.META_DESCRIPTION_TOO_SHORT,
        message: `Meta description too short (${metaDescription.length} chars)`,
        meta: { length: metaDescription.length },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    } else if (metaDescription.length > 160) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.META_DESCRIPTION_TOO_LONG),
        issueCode: IssueCode.META_DESCRIPTION_TOO_LONG,
        message: `Meta description too long (${metaDescription.length} chars)`,
        meta: { length: metaDescription.length },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }

    const h1Count = $('h1').length;
    if (h1Count === 0) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.MISSING_H1),
        issueCode: IssueCode.MISSING_H1,
        message: 'No H1 tag found',
        resourceUrl: pageUrl,
        severity: Severity.HIGH,
      });
    } else if (h1Count > 1) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.MULTIPLE_H1),
        issueCode: IssueCode.MULTIPLE_H1,
        message: 'Multiple H1 tags found',
        meta: { count: h1Count },
        resourceUrl: pageUrl,
        severity: Severity.MEDIUM,
      });
    }

    pageIssues.push(...checkCanonicalTags($, pageUrl, finalUrl));

    const imagesWithoutAlt = $('img')
      .toArray()
      .filter((img) => !$(img).attr('alt')?.trim()).length;
    if (imagesWithoutAlt > 0) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.IMAGE_WITHOUT_ALT),
        issueCode: IssueCode.IMAGE_WITHOUT_ALT,
        message: `${imagesWithoutAlt} images without alt attribute`,
        meta: { count: imagesWithoutAlt },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }
    const imagesMissingDimensions = countImagesMissingDimensions($);
    if (imagesMissingDimensions > 0) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.IMAGE_MISSING_DIMENSIONS),
        issueCode: IssueCode.IMAGE_MISSING_DIMENSIONS,
        message: `${imagesMissingDimensions} images missing explicit width/height`,
        meta: { count: imagesMissingDimensions },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }

    const metaRobots = $('meta[name="robots"]').attr('content')?.toLowerCase() ?? '';
    if (metaRobots.includes('noindex') && !isExpectedNoindexUrl(pageUrl)) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.META_NOINDEX),
        issueCode: IssueCode.META_NOINDEX,
        message: 'Page has noindex directive',
        meta: { content: metaRobots },
        resourceUrl: pageUrl,
        severity: Severity.HIGH,
      });
    }

    const invalidHreflang = findInvalidHreflangLinks($, pageUrl);
    if (invalidHreflang.length > 0) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.INVALID_HREFLANG),
        issueCode: IssueCode.INVALID_HREFLANG,
        message: `Invalid hreflang tags detected (${invalidHreflang.length})`,
        meta: { samples: invalidHreflang.slice(0, 10) },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }
    if (metaRobots.includes('nofollow')) {
      pageIssues.push({
        category: getIssueCategory(IssueCode.META_NOFOLLOW),
        issueCode: IssueCode.META_NOFOLLOW,
        message: 'Page has nofollow directive',
        meta: { content: metaRobots },
        resourceUrl: pageUrl,
        severity: Severity.MEDIUM,
      });
    }

    const pageHost = (() => {
      try {
        return new URL(finalUrl).host;
      } catch {
        return;
      }
    })();
    const discovered: string[] = [];
    if (pageHost) {
      const seenLocal = new Set<string>();
      for (const node of $('a[href]').toArray()) {
        const raw = $(node).attr('href')?.trim();
        if (!raw) {
          continue;
        }
        if (
          raw.startsWith('#') ||
          raw.startsWith('mailto:') ||
          raw.startsWith('tel:') ||
          raw.startsWith('javascript:')
        ) {
          continue;
        }
        const resolved = safeResolveUrl(raw, finalUrl);
        if (!resolved) {
          continue;
        }
        if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) {
          continue;
        }
        try {
          if (new URL(resolved).host !== pageHost) {
            continue;
          }
        } catch {
          continue;
        }
        if (!isSeoCrawlCandidateUrl(resolved)) {
          continue;
        }
        const normalized = stripTrackingParams(resolved);
        if (seenLocal.has(normalized)) {
          continue;
        }
        seenLocal.add(normalized);
        discovered.push(normalized);
        if (discovered.length >= MAX_LINKS_PER_PAGE) {
          break;
        }
      }
    }

    return {
      issues: pageIssues,
      links: discovered,
      page: { contentType, responseMs, statusCode, url: pageUrl },
      text,
    };
  } catch {
    return {
      issues: pageIssues,
      page: { contentType, responseMs, statusCode, url: pageUrl },
    };
  }
}
