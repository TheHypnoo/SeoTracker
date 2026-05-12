import { describe, expect, it } from '@jest/globals';
import { IssueCode } from '@seotracker/shared-types';
import { load } from 'cheerio';

import { analyzeHomepageHtml } from './homepage-html-analyzer';

function htmlResponse(
  url = 'https://example.test/',
  init: { headers?: Record<string, string>; redirected?: boolean; status?: number } = {},
): Response {
  const headers = new Headers(init.headers ?? {});
  // Response is read-only on `url` and `redirected` in real fetch, but for
  // pure analysis we can construct a Response and override via Object.defineProperty.
  const r = new Response('', { status: init.status ?? 200, headers });
  Object.defineProperty(r, 'url', { value: url, writable: false });
  Object.defineProperty(r, 'redirected', { value: init.redirected ?? false, writable: false });
  return r;
}

function codes(out: { issues: { issueCode: string }[] }): string[] {
  return out.issues.map((i) => i.issueCode);
}

describe('analyzeHomepageHtml', () => {
  describe('HTTP-level checks', () => {
    it('flags HTTP 5xx as DOMAIN_UNREACHABLE', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><title>x</title></head><body></body></html>'),
        response: htmlResponse('https://example.test/', { status: 502 }),
        html: '<html></html>',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.DOMAIN_UNREACHABLE);
    });

    it('flags non-HTTPS sites as NO_HTTPS', () => {
      const out = analyzeHomepageHtml({
        $: load('<html></html>'),
        response: htmlResponse('http://example.test/'),
        html: '<html></html>',
        homepageUrl: 'http://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.NO_HTTPS);
    });

    it('flags HTTPS without HSTS as MISSING_HSTS', () => {
      const out = analyzeHomepageHtml({
        $: load('<html></html>'),
        response: htmlResponse('https://example.test/'),
        html: '<html></html>',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_HSTS);
    });

    it('does NOT flag MISSING_HSTS when the header is present', () => {
      const out = analyzeHomepageHtml({
        $: load('<html></html>'),
        response: htmlResponse('https://example.test/', {
          headers: { 'strict-transport-security': 'max-age=31536000' },
        }),
        html: '<html></html>',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).not.toContain(IssueCode.MISSING_HSTS);
    });

    it('flags REDIRECT_CHAIN when the final URL differs from the homepage', () => {
      const out = analyzeHomepageHtml({
        $: load('<html></html>'),
        response: htmlResponse('https://example.test/landing', { redirected: true }),
        html: '<html></html>',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.REDIRECT_CHAIN);
    });

    it('flags MISSING_COMPRESSION when html > 20KB and no compression header', () => {
      const big = 'x'.repeat(25_000);
      const out = analyzeHomepageHtml({
        $: load(`<html><body>${big}</body></html>`),
        response: htmlResponse('https://example.test/'),
        html: `<html><body>${big}</body></html>`,
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_COMPRESSION);
    });

    it('flags PAGE_TOO_HEAVY when html > 1.5MB', () => {
      const huge = 'x'.repeat(1_600_000);
      const out = analyzeHomepageHtml({
        $: load('<html></html>'),
        response: htmlResponse('https://example.test/'),
        html: huge,
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.PAGE_TOO_HEAVY);
    });
  });

  describe('Title and meta description', () => {
    it('flags MISSING_TITLE when there is no <title>', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head></head><body></body></html>'),
        response: htmlResponse(),
        html: '<html></html>',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_TITLE);
    });

    it('flags TITLE_TOO_SHORT (<30 chars)', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><title>short</title></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.TITLE_TOO_SHORT);
    });

    it('flags TITLE_TOO_LONG (>60 chars)', () => {
      const longTitle = 'a'.repeat(80);
      const out = analyzeHomepageHtml({
        $: load(`<html><head><title>${longTitle}</title></head></html>`),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.TITLE_TOO_LONG);
    });

    it('flags MISSING_META_DESCRIPTION', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><title>A title that is long enough to pass</title></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_META_DESCRIPTION);
    });
  });

  describe('Headings', () => {
    it('flags MISSING_H1 when no <h1>', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><body><h2>x</h2></body></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_H1);
    });

    it('flags MULTIPLE_H1 when more than one <h1>', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><body><h1>a</h1><h1>b</h1></body></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MULTIPLE_H1);
    });
  });

  describe('Canonical', () => {
    it('flags MISSING_CANONICAL when no canonical link', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><title>plenty long enough title here for OK</title></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_CANONICAL);
    });

    it('flags CANONICAL_MISMATCH when canonical points elsewhere', () => {
      const out = analyzeHomepageHtml({
        $: load(
          '<html><head><link rel="canonical" href="https://other.test/"></head><body></body></html>',
        ),
        response: htmlResponse('https://example.test/'),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.CANONICAL_MISMATCH);
    });
  });

  describe('Robots meta', () => {
    it('flags META_NOINDEX as CRITICAL', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><meta name="robots" content="noindex"></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.META_NOINDEX);
      const noindexIssue = out.issues.find((i) => i.issueCode === IssueCode.META_NOINDEX);
      expect(noindexIssue?.severity).toBe('CRITICAL');
    });

    it('flags META_NOFOLLOW', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head><meta name="robots" content="nofollow"></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.META_NOFOLLOW);
    });
  });

  describe('Open Graph + Twitter + JSON-LD + Mixed content', () => {
    it('flags MISSING_OPEN_GRAPH when og tags are absent', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_OPEN_GRAPH);
    });

    it('flags MISSING_TWITTER_CARD when twitter:card is absent', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_TWITTER_CARD);
    });

    it('flags MISSING_STRUCTURED_DATA when no <script type="application/ld+json">', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><head></head></html>'),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MISSING_STRUCTURED_DATA);
    });

    it('flags INVALID_STRUCTURED_DATA when JSON-LD blocks fail to parse', () => {
      const out = analyzeHomepageHtml({
        $: load(
          '<html><head><script type="application/ld+json">{ NOT JSON }</script></head></html>',
        ),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.INVALID_STRUCTURED_DATA);
    });

    it('flags MIXED_CONTENT when HTTPS page references an http://image', () => {
      const out = analyzeHomepageHtml({
        $: load('<html><body><img src="http://insecure.test/x.png" alt="x"></body></html>'),
        response: htmlResponse('https://example.test/'),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.MIXED_CONTENT);
    });
  });

  describe('Lazy images', () => {
    it('flags NO_LAZY_IMAGES when <30% of >=10 images use loading=lazy', () => {
      const imgs = Array.from({ length: 12 }, (_, i) => `<img src="/${i}.png" alt="${i}">`).join(
        '',
      );
      const out = analyzeHomepageHtml({
        $: load(`<html><body>${imgs}</body></html>`),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      expect(codes(out)).toContain(IssueCode.NO_LAZY_IMAGES);
    });
  });

  describe('Aggregated metrics', () => {
    it('emits the expected metric keys', () => {
      const out = analyzeHomepageHtml({
        $: load(
          '<html lang="es"><head><title>some long enough title here</title><meta name="description" content="desc xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx"><meta name="viewport" content="width=device-width"></head><body><h1>a</h1></body></html>',
        ),
        response: htmlResponse(),
        html: '',
        homepageUrl: 'https://example.test/',
      });
      const keys = out.metrics.map((m) => m.key);
      expect(keys).toStrictEqual(
        expect.arrayContaining([
          'dom_nodes',
          'hreflang_tags',
          'title_length',
          'meta_description_length',
          'h1_count',
          'h2_count',
          'h3_count',
          'images_without_alt',
          'json_ld_blocks',
        ]),
      );
    });
  });
});
