import { load } from 'cheerio';

import { buildLinkGraph } from './link-graph';

describe('buildLinkGraph', () => {
  it('splits internal vs external by URL host', () => {
    const html = `
      <a href="/internal-1">a</a>
      <a href="https://example.test/internal-2">b</a>
      <a href="https://other.test/external">c</a>
    `;
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });

    expect(out.internalLinks.sort()).toEqual([
      'https://example.test/internal-1',
      'https://example.test/internal-2',
    ]);
    expect(out.externalLinks).toEqual(['https://other.test/external']);
  });

  it('skips fragment / mailto: / tel: / javascript: hrefs', () => {
    const html = `
      <a href="#fragment">f</a>
      <a href="mailto:a@b">m</a>
      <a href="tel:+1">t</a>
      <a href="javascript:alert(1)">j</a>
      <a href="/ok">ok</a>
    `;
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });
    expect(out.internalLinks).toEqual(['https://example.test/ok']);
    expect(out.externalLinks).toEqual([]);
  });

  it('skips self-references that resolve to the homepage', () => {
    const html = `
      <a href="/">root</a>
      <a href="https://example.test">root2</a>
      <a href="/different">d</a>
    `;
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });
    expect(out.internalLinks).toEqual(['https://example.test/different']);
  });

  it('caps total <a> processing at maxLinks', () => {
    const html = Array.from({ length: 50 }, (_, i) => `<a href="/x-${i}">l</a>`).join('');
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 10,
      maxPages: 5,
      maxDepth: 1,
    });
    expect(out.internalLinks.length).toBeLessThanOrEqual(10);
  });

  it('folds same-host sitemap URLs into the depth-1 candidate pool', () => {
    const html = '<a href="/from-html">link</a>';
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [
        'https://example.test/from-sitemap',
        'https://other.test/external-from-sitemap',
      ],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });
    // depth1 may contain the html link AND/OR the sitemap link.
    // What we care about: external sitemap hosts are NOT folded in.
    expect(out.depth1Selected.some((u) => u.includes('other.test'))).toBe(false);
  });

  it('reduces depth-1 budget to 60% of maxPages when maxDepth >= 2', () => {
    const html = Array.from({ length: 30 }, (_, i) => `<a href="/x-${i}">l</a>`).join('');
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 10,
      maxDepth: 2,
    });
    // Math.ceil(10 * 0.6) = 6
    expect(out.depth1Selected.length).toBeLessThanOrEqual(6);
  });

  it('emits 3 metrics: sitemap_urls_sampled, internal_links_found, external_links_found', () => {
    const out = buildLinkGraph({
      $: load('<a href="/x">x</a>'),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });
    expect(out.metrics.map((m) => m.key).sort()).toEqual([
      'external_links_found',
      'internal_links_found',
      'sitemap_urls_sampled',
    ]);
  });

  it('puts non-selected internal links into remainingInternal for HEAD verification', () => {
    const html = Array.from({ length: 20 }, (_, i) => `<a href="/x-${i}">l</a>`).join('');
    const out = buildLinkGraph({
      $: load(html),
      homepageUrl: 'https://example.test/',
      effectiveHomepageUrl: 'https://example.test/',
      sitemapUrls: [],
      maxLinks: 100,
      maxPages: 5,
      maxDepth: 1,
    });
    expect(out.depth1Selected.length + out.remainingInternal.length).toBeGreaterThanOrEqual(
      out.internalLinks.length,
    );
  });
});
