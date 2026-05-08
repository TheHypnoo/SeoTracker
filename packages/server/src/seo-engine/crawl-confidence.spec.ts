import { computeCrawlConfidence } from './crawl-confidence';

describe('computeCrawlConfidence', () => {
  it('reports high confidence when crawl coverage is complete and sitemap exists', () => {
    const metrics = computeCrawlConfidence({
      crawlCandidateCount: 2,
      maxDepth: 2,
      maxPages: 10,
      analyzedPages: [
        { statusCode: 200, url: 'https://x.test/' },
        { statusCode: 200, url: 'https://x.test/a' },
        { statusCode: 200, url: 'https://x.test/b' },
      ],
      sitemapUrls: ['https://x.test/a'],
      totalAnalyzed: 3,
    });

    expect(metrics).toContainEqual({ key: 'crawl_confidence_score', valueNum: 100 });
    expect(metrics).toContainEqual({ key: 'crawl_confidence_level', valueText: 'Alta' });
    expect(metrics).toContainEqual({ key: 'crawl_coverage_ratio', valueNum: 1 });
  });

  it('reports lower confidence when the audit only samples a small part of a large site', () => {
    const metrics = computeCrawlConfidence({
      crawlCandidateCount: 99,
      maxDepth: 1,
      maxPages: 5,
      analyzedPages: [{ statusCode: 200, url: 'https://x.test/' }],
      sitemapUrls: [],
      totalAnalyzed: 5,
    });

    expect(metrics).toContainEqual({ key: 'crawl_confidence_score', valueNum: 18 });
    expect(metrics).toContainEqual({ key: 'crawl_confidence_level', valueText: 'Baja' });
    expect(metrics).toContainEqual({ key: 'crawl_coverage_ratio', valueNum: 0.05 });
  });
});
