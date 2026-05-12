import { describe, expect, it } from '@jest/globals';
import { IssueCode } from '@seotracker/shared-types';
import { load } from 'cheerio';

import { runBlogChecks } from './content-checks';

describe('runBlogChecks', () => {
  it('returns [] for non-blog pages', () => {
    expect(
      runBlogChecks('https://x.test/about', load('<html></html>'), 'plain text'),
    ).toStrictEqual([]);
  });

  it('emits MISSING_ARTICLE_SCHEMA when blog-like and lacks JSON-LD', () => {
    const $ = load('<article><p>blog content</p></article>');
    const results = runBlogChecks('https://x.test/blog/post', $, 'lorem');
    expect(results.find((r) => r.issueCode === IssueCode.MISSING_ARTICLE_SCHEMA)).toBeDefined();
  });

  it('does NOT emit MISSING_ARTICLE_SCHEMA when JSON-LD has Article type', () => {
    const $ = load(
      '<article><script type="application/ld+json">{"@type":"Article"}</script></article>',
    );
    const results = runBlogChecks('https://x.test/blog/post', $, 'lorem');
    expect(results.find((r) => r.issueCode === IssueCode.MISSING_ARTICLE_SCHEMA)).toBeUndefined();
  });

  it('emits MISSING_AUTHOR when no author meta', () => {
    const $ = load('<article>x</article>');
    const results = runBlogChecks('https://x.test/blog/y', $, '');
    expect(results.find((r) => r.issueCode === IssueCode.MISSING_AUTHOR)).toBeDefined();
  });

  it('emits STALE_CONTENT when modifiedDate is older than 730 days', () => {
    const oldDate = new Date(Date.now() - 800 * 86_400_000).toISOString();
    const $ = load(
      `<article><meta property="article:modified_time" content="${oldDate}"><meta name="author" content="X"></article>`,
    );
    const results = runBlogChecks('https://x.test/blog/y', $, '');
    expect(results.find((r) => r.issueCode === IssueCode.STALE_CONTENT)).toBeDefined();
  });

  it('does NOT emit STALE_CONTENT for fresh content', () => {
    const fresh = new Date().toISOString();
    const $ = load(
      `<article><meta property="article:modified_time" content="${fresh}"><meta name="author" content="X"></article>`,
    );
    const results = runBlogChecks('https://x.test/blog/y', $, '');
    expect(results.find((r) => r.issueCode === IssueCode.STALE_CONTENT)).toBeUndefined();
  });

  it('emits SHORT_BLOG_POST when wordCount in (0, 600)', () => {
    const $ = load('<article>x</article>');
    const text = 'one two three four five';
    const results = runBlogChecks('https://x.test/blog/y', $, text);
    expect(results.find((r) => r.issueCode === IssueCode.SHORT_BLOG_POST)).toBeDefined();
  });

  it('emits POOR_READABILITY when Flesch < 30', () => {
    // Long sentence with rare/long words → low Flesch
    const text =
      `${Array.from({ length: 60 }, () => 'antidisestablishmentarianism').join(' ')}.`.repeat(2);
    const $ = load('<article>x</article>');
    const results = runBlogChecks('https://x.test/blog/y', $, text);
    expect(results.find((r) => r.issueCode === IssueCode.POOR_READABILITY)).toBeDefined();
  });
});
