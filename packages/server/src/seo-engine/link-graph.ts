import type { CheerioAPI } from 'cheerio';

import type { SeoMetric } from './seo-engine.types';
import {
  normalizeForComparison,
  safeResolveUrl,
  stratifiedSample,
  stripTrackingParams,
} from './url-utils';

export type LinkGraph = {
  homepageKey: string;
  internalLinks: string[];
  externalLinks: string[];
  /** First-pass selection (homepage + N internal + sitemap) for depth-1 crawling. */
  depth1Selected: string[];
  /** Internal links not picked for depth-1; HEAD-checked at the end. */
  remainingInternal: string[];
  metrics: SeoMetric[];
};

type BuildInput = {
  $: CheerioAPI;
  homepageUrl: string;
  /** URL of the actually-fetched page (after redirects) — used to skip self-links. */
  effectiveHomepageUrl: string;
  sitemapUrls: string[];
  maxLinks: number;
  maxPages: number;
  maxDepth: number;
};

/**
 * Build the crawl graph from the homepage's <a> tags + sitemap entries.
 *
 * - Filters out anchors, mailto/tel/javascript schemes, and self-references.
 * - Splits same-host vs external by URL host.
 * - Folds in sitemap entries that share the homepage host.
 * - Applies a stratified sample to keep depth-1 within `maxPages` budget.
 *
 * Returned `metrics` cover the discovery counts; the orchestrator pushes them
 * straight into the final audit metrics list.
 */
export function buildLinkGraph(input: BuildInput): LinkGraph {
  const { $, homepageUrl, effectiveHomepageUrl, sitemapUrls, maxLinks, maxPages, maxDepth } = input;
  const homepageKey = normalizeForComparison(effectiveHomepageUrl);
  const homepageHost = new URL(homepageUrl).host;
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const seenLinks = new Set<string>();

  for (const node of $('a[href]').toArray()) {
    const raw = $(node).attr('href')?.trim();
    if (!raw) continue;
    if (
      raw.startsWith('#') ||
      raw.startsWith('mailto:') ||
      raw.startsWith('tel:') ||
      raw.startsWith('javascript:')
    ) {
      continue;
    }
    const resolved = safeResolveUrl(raw, homepageUrl);
    if (!resolved) continue;
    if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) continue;
    if (normalizeForComparison(resolved) === homepageKey) continue;
    if (seenLinks.has(resolved)) continue;
    seenLinks.add(resolved);
    try {
      const host = new URL(resolved).host;
      if (host === homepageHost) {
        internalLinks.push(resolved);
      } else {
        externalLinks.push(resolved);
      }
    } catch {
      // ignore malformed URL
    }
    if (seenLinks.size >= maxLinks) break;
  }

  const sitemapSameHost = sitemapUrls.filter((u) => {
    try {
      return new URL(u).host === homepageHost && normalizeForComparison(u) !== homepageKey;
    } catch {
      return false;
    }
  });

  const crawlCandidatePool: string[] = [];
  const crawlCandidateSeen = new Set<string>();
  for (const url of [...internalLinks, ...sitemapSameHost]) {
    const normalized = stripTrackingParams(url);
    if (crawlCandidateSeen.has(normalized)) continue;
    crawlCandidateSeen.add(normalized);
    crawlCandidatePool.push(normalized);
  }

  const depth1Budget = maxDepth >= 2 ? Math.max(1, Math.ceil(maxPages * 0.6)) : maxPages;
  const depth1Selected = stratifiedSample(crawlCandidatePool, depth1Budget);
  const depth1Set = new Set(depth1Selected);
  const remainingInternal = internalLinks.filter((u) => !depth1Set.has(stripTrackingParams(u)));

  return {
    homepageKey,
    internalLinks,
    externalLinks,
    depth1Selected,
    remainingInternal,
    metrics: [
      { key: 'sitemap_urls_sampled', valueNum: sitemapSameHost.length },
      { key: 'internal_links_found', valueNum: internalLinks.length },
      { key: 'external_links_found', valueNum: externalLinks.length },
    ],
  };
}
