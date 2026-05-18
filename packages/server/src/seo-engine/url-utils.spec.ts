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
      expect(normalizeForComparison('https://example.test/path?a=1#top')).toBe(
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
      ['https://example.test/features', 'other'],
      ['not a url', 'other'],
    ] as const)('classifies %s as %s', (url, bucket) => {
      expect(classifyUrlBucket(url)).toBe(bucket);
    });
  });

  describe('stratifiedSample', () => {
    it('fills remaining budget when buckets contain multiple unique URLs', () => {
      const urls = [
        'https://example.test/blog/a',
        'https://example.test/blog/b',
        'https://example.test/blog/c',
        'https://example.test/product/a',
        'https://example.test/product/b',
        'https://example.test/contact',
      ];

      expect(stratifiedSample(urls, 5)).toStrictEqual([
        'https://example.test/blog/a',
        'https://example.test/product/a',
        'https://example.test/contact',
        'https://example.test/blog/b',
        'https://example.test/product/b',
      ]);
    });

    it('falls back to original order when bucket cycling cannot fill the budget', () => {
      const urls = [
        'https://example.test/blog/a',
        'https://example.test/blog/a',
        'https://example.test/blog/b',
        'https://example.test/blog/c',
      ];

      expect(stratifiedSample(urls, 3)).toStrictEqual([
        'https://example.test/blog/a',
        'https://example.test/blog/b',
        'https://example.test/blog/c',
      ]);
    });

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

    it('stops bucket seeding and original-order fallback once the budget is full', () => {
      expect(
        stratifiedSample(
          [
            'https://example.test/blog/a',
            'https://example.test/product/a',
            'https://example.test/category/a',
            'https://example.test/contact',
          ],
          2,
        ),
      ).toStrictEqual(['https://example.test/blog/a', 'https://example.test/product/a']);

      expect(
        stratifiedSample(
          [
            'https://example.test/blog/a',
            'https://example.test/blog/a',
            'https://example.test/blog/b',
            'https://example.test/blog/c',
          ],
          2,
        ),
      ).toStrictEqual(['https://example.test/blog/a', 'https://example.test/blog/b']);
    });
  });
});
