import { load } from 'cheerio';

import {
  buildShingles,
  computeFleschScore,
  countWords,
  detectDuplicateContent,
  detectHeadingSkips,
  extractArticleMetadata,
  extractJsonLdTypes,
  extractTextForComparison,
  findMixedContent,
  isBlogLike,
  jaccard,
} from './content-utils';

describe('countWords', () => {
  it('returns 0 for empty/whitespace text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
  it('counts words', () => {
    expect(countWords('hello world  foo')).toBe(3);
  });
});

describe('buildShingles', () => {
  it('returns single shingle when fewer words than size', () => {
    expect(buildShingles('a b', 4)).toEqual(new Set(['a b']));
  });
  it('returns empty set on empty text', () => {
    expect(buildShingles('', 4).size).toBe(0);
  });
  it('builds rolling N-grams', () => {
    const result = buildShingles('a b c d e', 3);
    expect(result.has('a b c')).toBe(true);
    expect(result.has('b c d')).toBe(true);
    expect(result.has('c d e')).toBe(true);
    expect(result.size).toBe(3);
  });
});

describe('jaccard', () => {
  it('returns 0 when both empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
  it('returns 1 when sets equal', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });
  it('returns proportion of intersection over union', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
  });
});

describe('detectDuplicateContent', () => {
  it('returns empty when texts have <50 words', () => {
    const pairs = detectDuplicateContent(
      [
        { url: 'a', text: 'foo bar' },
        { url: 'b', text: 'foo bar' },
      ],
      0.7,
    );
    expect(pairs).toEqual([]);
  });

  it('emits pair when similarity above threshold', () => {
    const text = Array(60).fill('cat dog fish').join(' ');
    const pairs = detectDuplicateContent(
      [
        { url: 'a', text },
        { url: 'b', text },
      ],
      0.7,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.similarity).toBeGreaterThanOrEqual(0.7);
  });
});

describe('extractTextForComparison', () => {
  it('strips noisy elements and lowercases body text', () => {
    const $ = load(
      '<html><body><script>alert(1)</script><h1>Title</h1><nav>nav</nav><p>Hello WORLD</p></body></html>',
    );
    const text = extractTextForComparison($);
    expect(text).toContain('hello world');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('nav');
  });
});

describe('detectHeadingSkips', () => {
  it('detects skip from h1 to h3', () => {
    const $ = load('<h1>a</h1><h3>b</h3>');
    expect(detectHeadingSkips($)).toEqual([{ from: 1, to: 3 }]);
  });
  it('returns empty when sequential', () => {
    const $ = load('<h1>a</h1><h2>b</h2><h3>c</h3>');
    expect(detectHeadingSkips($)).toEqual([]);
  });
});

describe('findMixedContent', () => {
  it('flags http:// resources on https pages', () => {
    const $ = load(
      '<img src="http://insecure/img.png"><script src="https://safe/x.js"></script><iframe src="http://x"></iframe>',
    );
    const result = findMixedContent($);
    expect(result).toEqual(expect.arrayContaining(['http://insecure/img.png', 'http://x']));
    expect(result).not.toContain('https://safe/x.js');
  });
});

describe('extractJsonLdTypes', () => {
  it('extracts @type from single object', () => {
    const $ = load('<script type="application/ld+json">{"@type":"Article"}</script>');
    expect(extractJsonLdTypes($)).toEqual(['Article']);
  });
  it('extracts from arrays and @graph', () => {
    const $ = load(
      '<script type="application/ld+json">{"@graph":[{"@type":"Person"},{"@type":["BlogPosting","Article"]}]}</script>',
    );
    const types = extractJsonLdTypes($);
    expect(types).toEqual(expect.arrayContaining(['Person', 'BlogPosting', 'Article']));
  });
  it('ignores invalid JSON', () => {
    const $ = load('<script type="application/ld+json">{ invalid }</script>');
    expect(extractJsonLdTypes($)).toEqual([]);
  });
});

describe('extractArticleMetadata', () => {
  it('parses meta tags', () => {
    const $ = load(
      '<meta property="article:modified_time" content="2024-01-02T00:00:00Z">' +
        '<meta property="article:published_time" content="2024-01-01T00:00:00Z">' +
        '<meta name="author" content="Sergi">',
    );
    const meta = extractArticleMetadata($);
    expect(meta.modifiedDate?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
    expect(meta.publishedDate?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(meta.author).toBe('Sergi');
  });

  it('falls back to JSON-LD when meta tags absent', () => {
    const $ = load(
      '<script type="application/ld+json">{"datePublished":"2024-05-05","dateModified":"2024-05-06","author":{"name":"Ana"}}</script>',
    );
    const meta = extractArticleMetadata($);
    expect(meta.publishedDate).toBeInstanceOf(Date);
    expect(meta.modifiedDate).toBeInstanceOf(Date);
    expect(meta.author).toBe('Ana');
  });

  it('handles author as object with name property', () => {
    const $ = load('<script type="application/ld+json">{"author":{"name":"FirstName"}}</script>');
    expect(extractArticleMetadata($).author).toBe('FirstName');
  });

  it('returns undefined fields when no metadata', () => {
    const $ = load('<html></html>');
    const meta = extractArticleMetadata($);
    expect(meta.author).toBeUndefined();
    expect(meta.modifiedDate).toBeUndefined();
    expect(meta.publishedDate).toBeUndefined();
  });

  it('skips invalid date strings', () => {
    const $ = load(
      '<meta property="article:modified_time" content="not-a-date"><meta name="author" content="X">',
    );
    expect(extractArticleMetadata($).modifiedDate).toBeUndefined();
  });
});

describe('isBlogLike', () => {
  it('matches /blog/ in URL', () => {
    expect(isBlogLike('https://x.com/blog/foo', load(''))).toBe(true);
  });
  it('matches <article> tag', () => {
    expect(isBlogLike('https://x.com/foo', load('<article>x</article>'))).toBe(true);
  });
  it('matches BlogPosting JSON-LD type', () => {
    const $ = load('<script type="application/ld+json">{"@type":"BlogPosting"}</script>');
    expect(isBlogLike('https://x.com/foo', $)).toBe(true);
  });
  it('returns false otherwise', () => {
    expect(isBlogLike('https://x.com/about', load('<p>plain</p>'))).toBe(false);
  });
});

describe('computeFleschScore', () => {
  it('returns undefined for short text', () => {
    expect(computeFleschScore('hi there')).toBeUndefined();
  });
  it('returns a numeric score for long enough text', () => {
    const text =
      'This is a sample paragraph with enough words to compute a score. ' +
      'It has multiple sentences. ' +
      'Each sentence varies in length. ' +
      'The function should compute readability without throwing. ' +
      'Just enough words to pass the fifty word threshold and produce a deterministic output. ' +
      'And one more for good measure to be safe!';
    const score = computeFleschScore(text);
    expect(score).toBeDefined();
    expect(typeof score).toBe('number');
  });
});
