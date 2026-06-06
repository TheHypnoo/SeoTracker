import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IssueCode } from '@seotracker/shared-types';
import { load } from 'cheerio';

import {
  analyzeAndSampleSitemap,
  analyzeInternalPage,
  analyzeSitemap,
  analyzeJsonLdBlocks,
  checkCanonicalTags,
  checkSoft404,
  countImagesMissingDimensions,
  existsUrl,
  extractSitemapHintsFromHtml,
  extractSitemapUrls,
  findInvalidHreflangLinks,
  fetchRobots,
  probeSitemap,
} from './crawler';

// Mock safeFetch — every helper in crawler.ts hits the network through it.
// We keep readBodyWithLimit and ResponseTooLargeError real so the body-size
// guard behaves as in production; only the outbound fetch is faked.
jest.mock<typeof import('../common/utils/safe-fetch')>('../common/utils/safe-fetch', () => {
  const actual = jest.requireActual<typeof import('../common/utils/safe-fetch')>(
    '../common/utils/safe-fetch',
  );
  return {
    ...actual,
    safeFetch: jest.fn(),
  };
});

const safeFetch = jest.mocked(jest.requireMock('../common/utils/safe-fetch').safeFetch);

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

describe('fetchRobots', () => {
  beforeEach(() => safeFetch.mockReset());

  it('parses Sitemap directives (one per line)', async () => {
    safeFetch.mockResolvedValueOnce(
      textResponse(
        200,
        ['Sitemap: https://x.test/sitemap.xml', 'Sitemap: https://x.test/news.xml'].join('\n'),
      ),
    );
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(true);
    expect(result.sitemaps).toStrictEqual([
      'https://x.test/sitemap.xml',
      'https://x.test/news.xml',
    ]);
  });

  it('detects Disallow: / for User-agent: *', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(200, 'User-agent: *\nDisallow: /'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.disallowsAll).toBe(true);
  });

  it('handles grouped agents, duplicate agents and non-disallow directives', async () => {
    safeFetch.mockResolvedValueOnce(
      textResponse(
        200,
        [
          'User-agent: *',
          'User-agent: *',
          'Allow: /public',
          'Disallow: /',
          '',
          'User-agent: GPTBot',
          'Disallow: /',
          'User-agent: OtherBot',
          'Disallow: /',
        ].join('\n'),
      ),
    );

    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');

    expect(result.disallowsAll).toBe(true);
    expect(result.blockedAiBots).toStrictEqual(['gptbot']);
  });

  it('handles robots responses without content type and directives outside an agent group', async () => {
    safeFetch.mockResolvedValueOnce(
      new Response(new TextEncoder().encode('Disallow: /\nHost: x.test'), { status: 200 }),
    );

    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');

    expect(result.exists).toBe(true);
    expect(result.disallowsAll).toBe(false);
    expect(result.page.contentType).toBeUndefined();
  });

  it('detects AI bots blocked by Disallow: /', async () => {
    safeFetch.mockResolvedValueOnce(
      textResponse(
        200,
        ['User-agent: GPTBot', 'Disallow: /', 'User-agent: ClaudeBot', 'Disallow: /'].join('\n'),
      ),
    );
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.blockedAiBots.sort()).toStrictEqual(['claudebot', 'gptbot']);
  });

  it('returns status=MISSING on 4xx (no body parse)', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(404, 'not found'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.status).toBe('MISSING');
    expect(result.sitemaps).toStrictEqual([]);
    expect(result.page.statusCode).toBe(404);
  });

  it('returns status=INCONCLUSIVE on fetch error (and a page with all undefined)', async () => {
    safeFetch.mockRejectedValue(new Error('econnrefused'));
    const result = await fetchRobots('https://x.test/robots.txt', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.errorReason).toBeTruthy();
    expect(result.page.statusCode).toBeUndefined();
  });
});

describe('checkSoft404', () => {
  beforeEach(() => safeFetch.mockReset());

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

  it('records undefined content type for soft 404 probes without headers', async () => {
    safeFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const out = await checkSoft404('https://x.test', 1000, 'UA');

    expect(out.page?.contentType).toBeUndefined();
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

  it('ignores sitemap-looking nodes without resolvable hrefs', () => {
    const $ = load(
      '<link rel="sitemap"><a href="">empty sitemap.xml</a><a href="http://[::1/sitemap.xml">bad sitemap.xml</a>',
    );
    expect(extractSitemapHintsFromHtml($, 'https://x.test/')).toStrictEqual([]);
  });

  it('ignores link sitemap hints that cannot be resolved', () => {
    const $ = load('<link rel="sitemap" href="http://[::1/sitemap.xml">');

    expect(extractSitemapHintsFromHtml($, 'https://x.test/')).toStrictEqual([]);
  });
});

describe('probeSitemap', () => {
  beforeEach(() => safeFetch.mockReset());

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

  it('detects XML sitemap snippets without content type headers', async () => {
    safeFetch.mockResolvedValueOnce(
      new Response(new TextEncoder().encode('<?xml version="1.0"?><root>sitemap</root>')),
    );

    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.isSitemap).toBe(true);
    expect(result.page.contentType).toBeUndefined();
  });

  it('returns isSitemap=false on 4xx', async () => {
    safeFetch.mockResolvedValueOnce(textResponse(404, 'not found'));
    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.isSitemap).toBe(false);
    expect(result.page.statusCode).toBe(404);
  });

  it('returns isSitemap=false on fetch errors with an empty page result', async () => {
    safeFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.isSitemap).toBe(false);
    expect(result.status).toBe('inconclusive');
    expect(result.page).toMatchObject({
      contentType: undefined,
      statusCode: undefined,
      url: 'https://x.test/sitemap.xml',
    });
  });

  it('detects sitemap probes from a prefix without downloading the full body', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(200, '<urlset><url><loc>https://x.test/a</loc></url></urlset>', {
        'content-length': String(51 * 1024 * 1024),
      }),
    );

    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.isSitemap).toBe(true);
    expect(result.status).toBe('found');
  });

  it('classifies sitemap probe timeouts as inconclusive', async () => {
    safeFetch
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'))
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'));

    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.isSitemap).toBe(false);
    expect(result.status).toBe('inconclusive');
    expect(result.errorReason).toBe('timeout');
  });

  it('retries transient sitemap probe timeouts once', async () => {
    safeFetch
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'))
      .mockResolvedValueOnce(xmlResponse(200, '<urlset></urlset>'));

    const result = await probeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.status).toBe('found');
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });
});

describe('analyzeSitemap', () => {
  beforeEach(() => safeFetch.mockReset());

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
    safeFetch
      .mockResolvedValueOnce(xmlResponse(503, ''))
      .mockResolvedValueOnce(xmlResponse(503, ''));
    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');
    expect(result.urlCount).toBeNull();
  });

  it('retries transient 5xx sitemap responses once', async () => {
    safeFetch
      .mockResolvedValueOnce(xmlResponse(503, ''))
      .mockResolvedValueOnce(xmlResponse(200, '<urlset><url><loc>x</loc></url></urlset>'));

    const result = await analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA');

    expect(result.urlCount).toBe(1);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('returns a neutral result on fetch errors', async () => {
    safeFetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'));
    await expect(analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA')).resolves.toStrictEqual({
      invalid: false,
      urlCount: null,
    });
  });

  it('marks sitemaps above the 50MB protocol limit as invalid', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(200, '', { 'content-length': String(51 * 1024 * 1024) }),
    );

    await expect(analyzeSitemap('https://x.test/sitemap.xml', 1000, 'UA')).resolves.toStrictEqual({
      invalid: true,
      urlCount: null,
    });
  });
});

describe('extractSitemapUrls', () => {
  beforeEach(() => safeFetch.mockReset());

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
    expect(urls.sort()).toStrictEqual(['https://x.test/a', 'https://x.test/b']);
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
    expect(urls).toStrictEqual(['https://x.test/page-1']);
  });

  it('respects the limit', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        `${Array.from({ length: 10 }, (_, i) => `<url><loc>https://x.test/p${i}</loc></url>`).join(
          '',
        )}</urlset>`,
      ),
    );
    const urls = await extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 3);
    expect(urls).toHaveLength(3);
  });

  it('skips empty root sitemap URLs before fetching', async () => {
    await expect(extractSitemapUrls('', 1000, 'UA', 10)).resolves.toStrictEqual([]);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('skips 4xx roots and empty sitemap loc entries', async () => {
    safeFetch
      .mockResolvedValueOnce(xmlResponse(404, 'missing'))
      .mockResolvedValueOnce(
        xmlResponse(
          200,
          '<urlset><url><loc>   </loc></url><url><loc>https://x.test/ok</loc></url></urlset>',
        ),
      );

    await expect(
      extractSitemapUrls('https://x.test/missing.xml', 1000, 'UA', 10),
    ).resolves.toStrictEqual([]);
    await expect(
      extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 10),
    ).resolves.toStrictEqual(['https://x.test/ok']);
  });

  it('skips unreachable child sitemaps and keeps collecting from the remaining queue', async () => {
    safeFetch
      .mockResolvedValueOnce(
        xmlResponse(
          200,
          `<sitemapindex>
            <sitemap><loc>https://x.test/failing.xml</loc></sitemap>
            <sitemap><loc>https://x.test/working.xml</loc></sitemap>
          </sitemapindex>`,
        ),
      )
      .mockRejectedValueOnce(new Error('child down'))
      .mockResolvedValueOnce(
        xmlResponse(200, '<urlset><url><loc>https://x.test/page-ok</loc></url></urlset>'),
      );

    await expect(
      extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 10),
    ).resolves.toStrictEqual(['https://x.test/page-ok']);
  });

  it('skips empty sitemap-index locs and stops enqueueing after the sitemap cap', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        `<sitemapindex>
          <sitemap><loc>   </loc></sitemap>
          ${Array.from(
            { length: 10 },
            (_, index) => `<sitemap><loc>https://x.test/child-${index}.xml</loc></sitemap>`,
          ).join('')}
        </sitemapindex>`,
      ),
    );
    for (let index = 0; index < 7; index += 1) {
      safeFetch.mockResolvedValueOnce(xmlResponse(404, 'not found'));
    }

    await expect(
      extractSitemapUrls('https://x.test/sitemap.xml', 1000, 'UA', 10),
    ).resolves.toStrictEqual([]);
    expect(safeFetch).toHaveBeenCalledTimes(8);
  });
});

describe('analyzeAndSampleSitemap', () => {
  beforeEach(() => safeFetch.mockReset());

  it('validates and samples a flat sitemap with a single root download', async () => {
    safeFetch.mockResolvedValueOnce(
      xmlResponse(
        200,
        `<urlset>
          <url><loc>https://x.test/a</loc></url>
          <url><loc>https://x.test/b</loc></url>
        </urlset>`,
      ),
    );

    const result = await analyzeAndSampleSitemap('https://x.test/sitemap.xml', 1000, 'UA', 100);

    expect(result).toStrictEqual({
      invalid: false,
      urlCount: 2,
      urls: ['https://x.test/a', 'https://x.test/b'],
    });
    // The root sitemap is downloaded once and reused for both analysis and
    // extraction (no duplicate GET).
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('reuses the root body and only refetches child sitemaps of an index', async () => {
    safeFetch
      .mockResolvedValueOnce(
        xmlResponse(
          200,
          `<sitemapindex><sitemap><loc>https://x.test/sub.xml</loc></sitemap></sitemapindex>`,
        ),
      )
      .mockResolvedValueOnce(
        xmlResponse(200, `<urlset><url><loc>https://x.test/page-1</loc></url></urlset>`),
      );

    const result = await analyzeAndSampleSitemap('https://x.test/sitemap.xml', 1000, 'UA', 50);

    expect(result.urls).toStrictEqual(['https://x.test/page-1']);
    // Root (index) + one child = 2 fetches, not 3 (no separate analyze GET).
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('does not extract urls from an invalid sitemap', async () => {
    safeFetch.mockResolvedValueOnce(xmlResponse(200, 'not xml at all'));

    const result = await analyzeAndSampleSitemap('https://x.test/sitemap.xml', 1000, 'UA', 50);

    expect(result).toStrictEqual({ invalid: true, urlCount: null, urls: [] });
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
});

describe('existsUrl', () => {
  beforeEach(() => safeFetch.mockReset());

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

  it('returns exists=false for GET fallback failures', async () => {
    safeFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response('still down', { status: 500 }))
      .mockResolvedValueOnce(new Response('still down', { status: 500 }));
    await expect(existsUrl('https://x.test/page', 1000, 'UA')).resolves.toMatchObject({
      exists: false,
      statusCode: 500,
    });
  });

  it('returns exists=false (with all undefined) on fetch error', async () => {
    safeFetch.mockRejectedValueOnce(new Error('boom'));
    const result = await existsUrl('https://x.test/page', 1000, 'UA');
    expect(result.exists).toBe(false);
    expect(result.statusCode).toBeUndefined();
  });
});

describe('analyzeInternalPage', () => {
  beforeEach(() => safeFetch.mockReset());

  it('returns early on 4xx, no issues collected', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(404, 'not found'));
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    expect(result.page.statusCode).toBe(404);
    expect(result.issues).toStrictEqual([]);
    expect(result.text).toBeUndefined();
  });

  it('returns early on non-HTML content type', async () => {
    safeFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await analyzeInternalPage('https://x.test/api', 1000, 'UA');
    expect(result.issues).toStrictEqual([]);
    expect(result.text).toBeUndefined();
  });

  it('collects MISSING_TITLE on an HTML page without a title', async () => {
    safeFetch.mockResolvedValueOnce(htmlResponse(200, '<html><head></head><body></body></html>'));
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    const codes = result.issues.map((i) => i.issueCode);
    expect(codes).toContain(IssueCode.MISSING_TITLE);
  });

  it('flags missing h1 and short meta descriptions', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        '<html><head><title>Useful public page title text</title><meta name="description" content="short"><link rel="canonical" href="https://x.test/p"></head><body></body></html>',
      ),
    );
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    const codes = result.issues.map((issue) => issue.issueCode);
    expect(codes).toStrictEqual(
      expect.arrayContaining([IssueCode.MISSING_H1, IssueCode.META_DESCRIPTION_TOO_SHORT]),
    );
  });

  it('flags TITLE_TOO_SHORT for a < 30-char title', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(200, '<html><head><title>short</title></head><body></body></html>'),
    );
    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    expect(result.issues.some((i) => i.issueCode === IssueCode.TITLE_TOO_SHORT)).toBe(true);
  });

  it('collects common on-page issues and internal links from HTML pages', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        `<html lang="en">
          <head>
            <title>${'A'.repeat(70)}</title>
            <meta name="description" content="${'B'.repeat(170)}">
            <meta name="robots" content="noindex,nofollow">
            <link rel="canonical" href="/canonical">
            <link rel="alternate" hreflang="bad_lang" href="::::">
            <script type="application/ld+json">{not-json}</script>
          </head>
          <body>
            <h1>One</h1><h1>Two</h1>
            <img src="/a.png"><img src="/b.png" alt="B" width="0" height="10">
            <a href="/inside?utm_source=newsletter">Inside</a>
            <a href="https://other.test/outside">Outside</a>
            <a href="mailto:test@example.com">Mail</a>
          </body>
        </html>`,
      ),
    );

    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');
    const codes = result.issues.map((issue) => issue.issueCode);

    expect(codes).toStrictEqual(
      expect.arrayContaining([
        IssueCode.TITLE_TOO_LONG,
        IssueCode.META_DESCRIPTION_TOO_LONG,
        IssueCode.MULTIPLE_H1,
        IssueCode.CANONICAL_MISMATCH,
        IssueCode.IMAGE_WITHOUT_ALT,
        IssueCode.IMAGE_MISSING_DIMENSIONS,
        IssueCode.META_NOINDEX,
        IssueCode.META_NOFOLLOW,
        IssueCode.INVALID_HREFLANG,
      ]),
    );
    expect(result.links).toStrictEqual(['https://x.test/inside']);
    expect(result.text).toStrictEqual(expect.any(String));
  });

  it('reports x-robots-tag noindex on public pages', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        '<html><head><title>Useful public page title text</title><meta name="description" content="This is a long enough description to avoid short description warnings in this focused case. It has enough words for the limit."><link rel="canonical" href="https://x.test/p"></head><body><h1>Heading</h1></body></html>',
        { 'x-robots-tag': 'noindex' },
      ),
    );

    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');

    expect(result.issues).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueCode: IssueCode.META_NOINDEX,
          meta: expect.objectContaining({ source: 'x-robots-tag' }),
        }),
      ]),
    );
  });

  it('does not report noindex on expected private pages', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        '<html><head><title>Account settings overview page</title><meta name="robots" content="noindex,nofollow"></head><body><h1>Settings</h1></body></html>',
      ),
    );

    const result = await analyzeInternalPage('https://x.test/settings', 1000, 'UA');

    expect(result.issues.some((issue) => issue.issueCode === IssueCode.META_NOINDEX)).toBe(false);
  });

  it('collects blog-check issues and skips empty, invalid, non-http and duplicate links', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        `<html>
          <head>
            <title>Useful public blog page title</title>
            <meta name="description" content="This is a long enough description to avoid unrelated description warnings in this branch-focused crawler test case.">
            <link rel="canonical" href="https://x.test/blog/post">
          </head>
          <body>
            <article><h1>Blog post</h1><p>Short article body.</p></article>
            <a href="">Empty</a>
            <a href="http://[::1">Invalid</a>
            <a href="ftp://x.test/file">FTP</a>
            <a href="/inside?utm_source=a">Inside A</a>
            <a href="/inside">Inside duplicate</a>
          </body>
        </html>`,
      ),
    );

    const result = await analyzeInternalPage('https://x.test/blog/post', 1000, 'UA');

    expect(result.issues).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueCode: IssueCode.MISSING_ARTICLE_SCHEMA }),
        expect.objectContaining({ issueCode: IssueCode.MISSING_AUTHOR }),
        expect.objectContaining({ issueCode: IssueCode.SHORT_BLOG_POST }),
      ]),
    );
    expect(result.links).toStrictEqual(['https://x.test/inside']);
  });

  it('caps discovered same-host links per page', async () => {
    const links = Array.from({ length: 45 }, (_, index) => `<a href="/p${index}">p</a>`).join('');
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        `<html><head><title>Useful public page title</title><meta name="description" content="This is a long enough description to avoid unrelated description warnings in this branch-focused crawler test case."><link rel="canonical" href="https://x.test/page"></head><body><h1>Title</h1>${links}</body></html>`,
      ),
    );

    const result = await analyzeInternalPage('https://x.test/page', 1000, 'UA');

    expect(result.links).toHaveLength(40);
  });

  it('does not discover infrastructure or expected private URLs for deeper crawling', async () => {
    safeFetch.mockResolvedValueOnce(
      htmlResponse(
        200,
        `<html>
          <head><title>Useful public page title</title></head>
          <body>
            <h1>Useful public page</h1>
            <a href="/public">Public</a>
            <a href="/cdn-cgi/content?id=token">Cloudflare</a>
            <a href="/account">Account</a>
          </body>
        </html>`,
      ),
    );

    const result = await analyzeInternalPage('https://x.test/page', 1000, 'UA');

    expect(result.links).toStrictEqual(['https://x.test/public']);
  });

  it('returns the partial page metadata when fetching HTML throws', async () => {
    safeFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');

    expect(result.issues).toStrictEqual([]);
    expect(result.page.statusCode).toBeUndefined();
  });

  it('returns no discovered links when the final response URL is malformed', async () => {
    const response = htmlResponse(
      200,
      `<html>
        <head>
          <title>Useful public page title</title>
          <meta name="description" content="This is a long enough description to avoid unrelated warnings for this branch coverage test.">
        </head>
        <body><h1>Useful page</h1><a href="/inside">Inside</a></body>
      </html>`,
    );
    Object.defineProperty(response, 'url', { value: '::::' });
    safeFetch.mockResolvedValueOnce(response);

    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');

    expect(result.links).toStrictEqual([]);
  });

  it('parses HTML responses even when content type is missing', async () => {
    safeFetch.mockResolvedValueOnce(
      new Response(
        new TextEncoder().encode(
          '<html><head><title>Useful public page title</title></head><body><h1>Heading</h1></body></html>',
        ),
        { status: 200 },
      ),
    );

    const result = await analyzeInternalPage('https://x.test/p', 1000, 'UA');

    expect(result.page.contentType).toBeUndefined();
    expect(result.text).toStrictEqual(expect.any(String));
  });
});

describe('low-level HTML checks', () => {
  it('detects missing canonical tags', () => {
    const issues = checkCanonicalTags(
      load('<title>No canonical</title>'),
      'https://x.test/p',
      'https://x.test/p',
    );
    expect(issues).toStrictEqual([
      expect.objectContaining({ issueCode: IssueCode.MISSING_CANONICAL }),
    ]);
  });

  it('detects missing, duplicate, relative and mismatched canonical tags', () => {
    const $ = load(`
      <link rel="canonical" href="/relative">
      <link rel="canonical" href="https://x.test/other">
    `);

    const issues = checkCanonicalTags($, 'https://x.test/p', 'https://x.test/p');
    const codes = issues.map((issue) => issue.issueCode);

    expect(codes).toStrictEqual(
      expect.arrayContaining([
        IssueCode.MULTIPLE_CANONICALS,
        IssueCode.CANONICAL_NOT_ABSOLUTE,
        IssueCode.CANONICAL_MISMATCH,
      ]),
    );
  });

  it('counts images without positive integer dimensions', () => {
    const $ = load('<img width="10" height="10"><img><img width="0" height="1">');

    expect(countImagesMissingDimensions($)).toBe(2);
  });

  it('returns no image dimension issues when every image has positive dimensions', () => {
    expect(countImagesMissingDimensions(load('<img width="1" height="1">'))).toBe(0);
  });

  it('reports invalid hreflang language, href and duplicates', () => {
    const $ = load(`
      <link rel="alternate" hreflang="en" href="/en">
      <link rel="alternate" hreflang="en" href="/en-duplicate">
      <link rel="alternate" hreflang="bad_lang" href="http://[::1">
      <link rel="alternate" hreflang="" href="/empty">
    `);

    expect(findInvalidHreflangLinks($, 'https://x.test/p')).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'duplicate-lang' }),
        expect.objectContaining({ reason: 'invalid-lang' }),
        expect.objectContaining({ reason: 'invalid-href' }),
      ]),
    );
  });

  it('handles alternate hreflang links without href attributes', () => {
    const $ = load('<link rel="alternate" hreflang="en">');

    expect(findInvalidHreflangLinks($, 'https://x.test/p')).toStrictEqual([]);
  });

  it('handles JSON-LD arrays, @graph blocks, primitives, invalid JSON and missing @type', () => {
    const $ = load(`
      <script type="application/ld+json">[{"@type":"Article"}]</script>
      <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"}]}</script>
      <script type="application/ld+json">{bad-json}</script>
      <script type="application/ld+json">{"name":"No type"}</script>
      <script type="application/ld+json"></script>
      <script type="application/ld+json">42</script>
    `);

    expect(analyzeJsonLdBlocks($)).toStrictEqual({
      invalidBlocks: [2],
      missingTypeBlocks: [3, 4, 5],
      total: 6,
    });
  });
});
