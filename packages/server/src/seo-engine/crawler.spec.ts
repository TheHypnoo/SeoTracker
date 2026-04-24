import { IssueCode } from '@seotracker/shared-types';
import { load } from 'cheerio';

import {
  analyzeInternalPage,
  analyzeSitemap,
  checkSoft404,
  existsUrl,
  extractSitemapHintsFromHtml,
  extractSitemapUrls,
  fetchRobots,
  probeSitemap,
} from './crawler';

// Mock safeFetch — every helper in crawler.ts hits the network through it.
jest.mock('../common/utils/safe-fetch', () => ({
  safeFetch: jest.fn(),
  SsrfBlockedError: class SsrfBlockedError extends Error {},
}));

const safeFetch = jest.requireMock('../common/utils/safe-fetch').safeFetch as jest.Mock;

function htmlResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  });
}

function textResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  });
}

function xmlResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml', ...headers },
  });
}

beforeEach(() => safeFetch.mockReset());

describe('fetchRobots', () => {
  it('parses Sitemap directives (one per line)', async () => {
    safeFetch.mockResolvedValueOnce(
      textResponse(
        200,
        ['Sitemap: https://x.test/sitemap.xml', 'Sitemap: https://x.test/news.xml'].join('\n'),
      ),
    );
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(true);
    expect(result.sitemaps).toEqual(['https://x.test/sitemap.xml', 'https://x.test/news.xml']);
  });

  it('detects Disallow: / for User-agent: *', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(200, 'User-agent: *\nDisallow: /'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.disallowsAll).toBe(true);
  });

  it('detects AI bots blocked by Disallow: /', async () => {
    safeFetch.mockResolvedValueOnce(
      textResponse(
        200,
        ['User-agent: GPTBot', 'Disallow: /', 'User-agent: ClaudeBot', 'Disallow: /'].join('\n'),
      ),
    );
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.blockedAiBots.sort()).toEqual(['claudebot', 'gptbot']);
  });

  it('returns exists=false on 4xx (no body parse)', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(404, 'not found'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.sitemaps).toEqual([]);
    expect(result.page.statusCode).toBe(404);
  });

  it('returns exists=false on fetch error (and a page with all undefined)', async () => {
    safeFetch.mockRejectedValueOnce(new Error('econnrefused'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.page.statusCode).toBeUndefined();
  });
});

describe('checkSoft404', () => {
  it('flags soft 404 when nonexistent URL returns 200', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(200, '<html>fake page</html>'));
    const out = await checkSoft404('https://x.test', 1000, 'UA');
    expect(out.isSoft404).toBe(true);
    expect(out.probedUrl).toContain('__seotracker_nonexistent_');
    expect(out.page?.statusCode).toBe(200);
  });

  it('does NOT flag when probe returns 404', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(404, 'not found'));
    const out = await checkSoft404('https://x.test', 1000, 'UA');
    expect(out.isSoft404).toBe(false);
  });

  it('returns isSoft404=false on fetch error', async () => {
    safeFetch.mockRejectedValueOnce(new Error('boom'));
    const out = await checkSoft404('https://x.test', 1000, 'UA');
    expect(out.isSoft404).toBe(false);
  });
});

describe('extractSitemapHintsFromHtml', () => {
  it('finds <link rel="sitemap">', () => {
    const $ = load('<link rel="sitemap" href="/sitemap.xml">');
    const hints = extractSitemapHintsFromHtml($, 'https://x.test/');
    expect(hints).toContain('https://x.test/sitemap.xml');
  });

  it('finds <a href> ending in sitemap.xml', () => {
    const $ = load('<a href="/news-sitemap.xml">News</a><a href="/about">about</a>');
    const hints = extractSitemapHintsFromHtml($, 'https://x.test/');
    expect(hints).toContain('https://x.test/news-sitemap.xml');
    expect(hints).not.toContain('https://x.test/about');
  });
});

describe('probeSitemap', () => {
  it('detects <urlset> as a valid sitemap', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(200, '<?xml version="1.0"?><urlset><url><loc>x</loc></url></urlset>'),
    );
    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.isSitemap).toBe(true);
  });

  it('detects <sitemapindex> as a valid sitemap index', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(200, '<?xml version="1.0"?><sitemapindex></sitemapindex>'),
    );
    const result = await probeSitemap('https://x.test/sitemap_index.xml', 1000, 'UA');
    expect(result.isSitemap).toBe(true);
  });

  it('returns isSitemap=false on 4xx', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(404, 'not found'));
    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.isSitemap).toBe(false);
    expect(result.page.statusCode).toBe(404);
  });
});

describe('analyzeSitemap', () => {
  it('counts <url> entries in a urlset', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        '<urlset><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>c</loc></url></urlset>',
      ),
    );
    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.invalid).toBe(false);
    expect(result.urlCount).toBe(3);
  });

  it('counts <sitemap> entries in a sitemap index', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        '<sitemapindex><sitemap><loc>a</loc></sitemap><sitemap><loc>b</loc></sitemap></sitemapindex>',
      ),
    );
    const result = await analyzeSitemap('https://x.test/sitemap_index.xml', 1000, 'UA');
    expect(result.urlCount).toBe(2);
  });

  it('flags invalid XML (no urlset / sitemapindex tags)', async () => {
    safeFetch.mockResolvedValueOnce(xmlResponse(200, '<random>not a sitemap</random>'));
    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.invalid).toBe(true);
  });

  it('treats empty body as invalid with urlCount=0', async () => {
    safeFetch.mockResolvedValueOnce(xmlResponse(200, '   '));
    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.invalid).toBe(true);
    expect(result.urlCount).toBe(0);
  });

  it('returns null urlCount on 4xx (sitemap unreachable)', async () => {
    safeFetch.mockResolvedValueOnce(xmlResponse(503, ''));
    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.urlCount).toBeNull();
  });
});

describe('extractSitemapUrls', () => {
  it('returns urls from a flat urlset, deduped + tracking-stripped', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        `<urlset>
          <url><loc>https://x.test/a?utm_source=email</loc></url>
          <url><loc>https://x.test/b</loc></url>
          <url><loc>https://x.test/a</loc></url>
        </urlset>`,
      ),
    );
    const urls = await extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 100);
    expect(urls.sort()).toEqual(['https://x.test/a', 'https://x.test/b']);
  });

  it('walks a sitemap index and collects child sitemap urls', async () => {
    safeFetch
      .mockResolvedValueOnce(
        xmlResponse(
          200,
          `<sitemapindex>
            <sitemap><loc>https://x.test/sub.xml</loc></sitemap>
          </sitemapindex>`,
        ),
      )
      .mockResolvedValueOnce(
        xmlResponse(
          200,
          `<urlset>
            <url><loc>https://x.test/page-1</loc></url>
          </urlset>`,
        ),
      );
    const urls = await extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 50);
    expect(urls).toEqual(['https://x.test/page-1']);
  });

  it('respects the limit', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        Array.from({ length: 10 }, (_, i) => `<url><loc>https://x.test/p${i}</loc></url>`).join(
          '',
        ) + '</urlset>',
      ),
    );
    const urls = await extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 3);
    expect(urls.length).toBe(3);
  });
});

describe('existsUrl', () => {
  it('returns exists=true when HEAD responds 200', async () => {
    safeFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await existsUrl('https://x.test/page', 1000, 'UA');
    expect(result.exists).toBe(true);
    expect(result.statusCode).toBe(200);
    // Single fetch — no GET fallback when HEAD already 2xx.
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GET when HEAD returns 405', async () => {
    safeFetch
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response('body', { status: 200 }));
    const result = await existsUrl('https://x.test/page', 1000, 'UA');
    expect(result.exists).toBe(true);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to GET when HEAD returns 4xx', async () => {
    safeFetch
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response('body', { status: 200 }));
    const result = await existsUrl('https://x.test/page', 1000, 'UA');
    expect(result.exists).toBe(true);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('returns exists=false (with all undefined) on fetch error', async () => {
    safeFetch.mockRejectedValueOnce(new Error('boom'));
    const result = await existsUrl('https://x.test/page', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.statusCode).toBeUndefined();
  });
});

describe('analyzeInternalPage', () => {
  it('returns early on 4xx, no issues collected', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(404, 'not found'));
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    expect(result.page.statusCode).toBe(404);
    expect(result.issues).toEqual([]);
    expect(result.text).toBeUndefined();
  });

  it('returns early on non-HTML content type', async () => {
    safeFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await analyzeInternalPage('https://x.test/api', 1000, 'UA');
    expect(result.issues).toEqual([]);
    expect(result.text).toBeUndefined();
  });

  it('collects MISSING_TITLE on an HTML page without a title', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(200, '<html><head></head><body></body></html>'));
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    const codes = result.issues.map((i) => i.issueCode);
    expect(codes).toContain(IssueCode.MISSING_TITLE);
  });

  it('flags TITLE_TOO_SHORT for a < 30-char title', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(200, '<html><head><title>short</title></head><body></body></html>'),
    );
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    expect(result.issues.some((i) => i.issueCode === IssueCode.TITLE_TOO_SHORT)).toBe(true);
  });
});
