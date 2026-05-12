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
    it.each([
      ['https://example.test/', 'home'],
      ['https://example.test/blog/post-1', 'article'],
      ['https://example.test/product/widget', 'product'],
      ['https://example.test/category/widgets', 'category'],
      ['https://example.test/page/2', 'pagination'],
      ['https://example.test/search?page=2', 'pagination'],
      ['https://example.test/contact', 'static'],
      ['https://example.test/a/b/c', 'article'],
      ['not a url', 'other'],
    ] as const)('classifies %s as %s', (url, bucket) => {
      expect(classifyUrlBucket(url)).toBe(bucket);
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

    it('handles empty inputs', () => {
      expect(stratifiedSample([], 10)).toStrictEqual([]);
    });

    it('handles zero budgets', () => {
      expect(stratifiedSample(['https://example.test/'], 0)).toStrictEqual([]);
    });

    it('handles budgets larger than the URL list', () => {
      expect(stratifiedSample(['https://example.test/a'], 5)).toStrictEqual([
        'https://example.test/a',
      ]);
    });
  });
});
