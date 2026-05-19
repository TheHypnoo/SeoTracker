import { describe, expect, it } from '@jest/globals';

import {
  isExcludedFromSeoCrawl,
  isExpectedNoindexUrl,
  isInfrastructureUrl,
  isSeoCrawlCandidateUrl,
} from './url-policy';

describe('url-policy', () => {
  it('recognizes Cloudflare infrastructure URLs case-insensitively', () => {
    expect(isInfrastructureUrl('https://example.test/CDN-CGI/challenge')).toBe(true);
    expect(isExcludedFromSeoCrawl('https://example.test/cdn-cgi/trace')).toBe(true);
  });

  it('does not classify malformed URLs or normal pages as infrastructure', () => {
    expect(isInfrastructureUrl('not a url')).toBe(false);
    expect(isExcludedFromSeoCrawl('https://example.test/blog/cdn-cgi-post')).toBe(false);
    expect(isExcludedFromSeoCrawl('not a url')).toBe(false);
  });

  it('recognizes private noindex paths by exact segment boundaries', () => {
    expect(isExpectedNoindexUrl('https://example.test/login')).toBe(true);
    expect(isExpectedNoindexUrl('https://example.test/login/reset')).toBe(true);
    expect(isExpectedNoindexUrl('https://example.test/login-help')).toBe(false);
    expect(isExpectedNoindexUrl('https://example.test/')).toBe(false);
    expect(isExpectedNoindexUrl('not a url')).toBe(false);
  });

  it('keeps SEO crawl candidates only when not infrastructure or expected noindex', () => {
    expect(isSeoCrawlCandidateUrl('https://example.test/blog/post')).toBe(true);
    expect(isSeoCrawlCandidateUrl('https://example.test/admin/users')).toBe(false);
    expect(isSeoCrawlCandidateUrl('https://example.test/cdn-cgi/trace')).toBe(false);
  });
});
