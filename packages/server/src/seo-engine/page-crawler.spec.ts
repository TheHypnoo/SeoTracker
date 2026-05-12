import { beforeEach, describe, expect, it, jest } from '@jest/globals';
jest.mock('./crawler', () => {
  const analyzeInternalPage = jest.fn();
  const existsUrl = jest.fn();
  return { analyzeInternalPage, existsUrl };
});

import { IssueCode } from '@seotracker/shared-types';

import { analyzeInternalPage, existsUrl } from './crawler';
import { crawlPages } from './page-crawler';

const analyzeMock = jest.mocked(analyzeInternalPage);
const existsMock = jest.mocked(existsUrl);

const okPage = (url: string, links: string[] = []) => ({
  page: { url, statusCode: 200 } as never,
  issues: [],
  text: 'body',
  links,
});

const brokenPage = (url: string, status: number) => ({
  page: { url, statusCode: status } as never,
  issues: [],
  text: '',
  links: [],
});

describe('crawlPages', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    existsMock.mockReset();
    existsMock.mockResolvedValue({ page: { url: 'x' } as never, exists: true, statusCode: 200 });
  });

  it('analyzes depth-1 only and emits pages_analyzed metric', async () => {
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/a'));
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/b'));

    const result = await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/a', 'https://x.test/b'],
      remainingInternal: [],
      externalLinks: [],
      maxDepth: 1,
      maxPages: 10,
      timeoutMs: 5000,
      userAgent: 'ua',
    });

    expect(result.totalAnalyzed).toBe(3); // 1 homepage + 2 depth-1
    expect(result.metrics).toContainEqual({ key: 'pages_analyzed', valueNum: 3 });
    expect(result.pageTexts).toHaveLength(2);
  });

  it('emits BROKEN_LINK for depth-1 page returning 4xx and skips text/issues', async () => {
    analyzeMock.mockResolvedValueOnce(brokenPage('https://x.test/404', 404));

    const result = await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/404'],
      remainingInternal: [],
      externalLinks: [],
      maxDepth: 1,
      maxPages: 10,
      timeoutMs: 1000,
      userAgent: 'ua',
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        issueCode: IssueCode.BROKEN_LINK,
        meta: { statusCode: 404 },
      }),
    );
    expect(result.pageTexts).toHaveLength(0);
  });

  it('explores depth-2 when maxDepth >= 2 with budget left', async () => {
    analyzeMock.mockResolvedValueOnce(
      okPage('https://x.test/a', ['https://x.test/sub1', 'https://x.test/sub2']),
    );
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/sub1'));
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/sub2'));

    const result = await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/a'],
      remainingInternal: [],
      externalLinks: [],
      maxDepth: 2,
      maxPages: 5,
      timeoutMs: 1000,
      userAgent: 'ua',
    });

    expect(analyzeMock).toHaveBeenCalledTimes(3);
    expect(result.metrics).toContainEqual({ key: 'depth2_pages_analyzed', valueNum: 2 });
    expect(result.metrics).toContainEqual({ key: 'pages_analyzed', valueNum: 4 });
  });

  it('skips depth-2 candidates already visited at depth-1', async () => {
    analyzeMock.mockResolvedValueOnce(
      okPage('https://x.test/a', ['https://x.test/b', 'https://x.test/c']),
    );
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/b'));
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/c'));

    await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/a', 'https://x.test/b'],
      remainingInternal: [],
      externalLinks: [],
      maxDepth: 2,
      maxPages: 10,
      timeoutMs: 1000,
      userAgent: 'ua',
    });
    // depth-2 should pick only c (b already at depth-1)
    const visitedUrls = analyzeMock.mock.calls.map((c) => c[0]);
    expect(visitedUrls).toContain('https://x.test/c');
    expect(visitedUrls.filter((u) => u === 'https://x.test/b')).toHaveLength(1);
  });

  it('does NOT explore depth-2 when budget hits zero', async () => {
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/a'));
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/b'));

    const result = await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/a', 'https://x.test/b'],
      remainingInternal: [],
      externalLinks: [],
      maxDepth: 2,
      maxPages: 2, // budget = max(0, 2 - 2) = 0 → no depth-2 enter
      timeoutMs: 1000,
      userAgent: 'ua',
    });
    expect(analyzeMock).toHaveBeenCalledTimes(2);
    expect(result.metrics.find((m) => m.key === 'depth2_pages_analyzed')).toBeUndefined();
  });

  it('runs HEAD checks for remainingInternal + externalLinks and emits broken issues', async () => {
    analyzeMock.mockResolvedValueOnce(okPage('https://x.test/a'));
    existsMock.mockResolvedValueOnce({
      page: { url: '' } as never,
      exists: false,
      statusCode: 404,
    });
    existsMock.mockResolvedValueOnce({ page: { url: '' } as never, exists: true, statusCode: 200 });

    const result = await crawlPages({
      homepageKey: 'x.test/',
      depth1Selected: ['https://x.test/a'],
      remainingInternal: ['https://x.test/dead'],
      externalLinks: ['https://other.test'],
      maxDepth: 1,
      maxPages: 5,
      timeoutMs: 1000,
      userAgent: 'ua',
    });

    expect(existsMock).toHaveBeenCalledTimes(2);
    const broken = result.issues.filter((i) => i.issueCode === IssueCode.BROKEN_LINK);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.meta).toStrictEqual({ statusCode: 404 });
  });
});
