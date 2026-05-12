import { describe, expect, it } from '@jest/globals';
import {
  classifyUrlBucket,
  normalizeForComparison,
  safeResolveUrl,
  stratifiedSample,
  stripTrackingParams,
} from './url-utils';

describe('url-utils', () => {
  describe('safeResolveUrl', () => {
    it('resolves relative URLs and returns undefined for malformed bases', () => {
      expect(safeResolveUrl('/pricing', 'https://example.test/app/')).toBe(
        'https://example.test/pricing',
      );
      expect(safeResolveUrl('/pricing', 'not a base')).toBeUndefined();
    });
  });

  describe('normalizeForComparison', () => {
    it('removes fragments and trailing slashes while preserving query strings', () => {
      expect(normalizeForComparison('https://example.test/path/?a=1#top')).toBe(
        'https://example.test/path?a=1',
      );
    });

    it('returns the original value when URL parsing fails', () => {
      expect(normalizeForComparison('not a url')).toBe('not a url');
    });
  });

  describe('stripTrackingParams', () => {
    it('removes known marketing params and preserves business params', () => {
      expect(
        stripTrackingParams(
          'https://example.test/p?utm_source=newsletter&gclid=abc&variant=b#section',
        ),
      ).toBe('https://example.test/p?variant=b#section');
    });

    it('returns the original value for malformed URLs', () => {
      expect(stripTrackingParams('::::')).toBe('::::');
    });
  });

  describe('classifyUrlBucket', () => {
    it('classifies important URL families used by stratified crawling', () => {
      expect(classifyUrlBucket('https://example.test/')).toBe('home');
      expect(classifyUrlBucket('https://example.test/blog/post-1')).toBe('article');
      expect(classifyUrlBucket('https://example.test/product/widget')).toBe('product');
      expect(classifyUrlBucket('https://example.test/category/widgets')).toBe('category');
      expect(classifyUrlBucket('https://example.test/page/2')).toBe('pagination');
      expect(classifyUrlBucket('https://example.test/search?page=2')).toBe('pagination');
      expect(classifyUrlBucket('https://example.test/contact')).toBe('static');
      expect(classifyUrlBucket('https://example.test/a/b/c')).toBe('article');
      expect(classifyUrlBucket('not a url')).toBe('other');
    });
  });

  describe('stratifiedSample', () => {
    it('spreads samples across URL buckets before filling remaining budget', () => {
      const urls = [
        'https://example.test/blog/a',
        'https://example.test/blog/b',
        'https://example.test/product/a',
        'https://example.test/category/a',
        'https://example.test/contact',
      ];

      expect(stratifiedSample(urls, 4)).toStrictEqual([
        'https://example.test/blog/a',
        'https://example.test/product/a',
        'https://example.test/category/a',
        'https://example.test/contact',
      ]);
    });

    it('handles empty inputs, zero budget and budgets larger than the URL list', () => {
      expect(stratifiedSample([], 10)).toStrictEqual([]);
      expect(stratifiedSample(['https://example.test/'], 0)).toStrictEqual([]);
      expect(stratifiedSample(['https://example.test/a'], 5)).toStrictEqual([
        'https://example.test/a',
      ]);
    });
  });
});
