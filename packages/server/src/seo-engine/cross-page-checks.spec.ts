import { IssueCode } from '@seotracker/shared-types';

import { runCrossPageChecks } from './cross-page-checks';

describe('runCrossPageChecks', () => {
  it('emits no issues when there is nothing to compare', () => {
    const out = runCrossPageChecks({ pageTexts: [] });
    expect(out.issues).toEqual([]);
    const dupMetric = out.metrics.find((m) => m.key === 'duplicate_content_pairs');
    expect(dupMetric?.valueNum).toBe(0);
  });

  it('flags THIN_CONTENT for pages with low word counts', () => {
    const out = runCrossPageChecks({
      pageTexts: [
        { url: 'https://x.test/short', text: 'just a few words here' },
        { url: 'https://x.test/longer', text: 'word '.repeat(500) },
      ],
    });
    const thin = out.issues.filter((i) => i.issueCode === IssueCode.THIN_CONTENT);
    expect(thin.length).toBe(1);
    expect(thin[0]?.resourceUrl).toBe('https://x.test/short');
  });

  it('does not flag THIN_CONTENT for pages with 0 words (probably not HTML)', () => {
    const out = runCrossPageChecks({ pageTexts: [{ url: 'https://x.test/empty', text: '' }] });
    expect(out.issues.filter((i) => i.issueCode === IssueCode.THIN_CONTENT).length).toBe(0);
  });

  it('flags DUPLICATE_CONTENT when two pages exceed the similarity threshold', () => {
    const longText =
      'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum';
    const out = runCrossPageChecks({
      pageTexts: [
        { url: 'https://x.test/a', text: longText },
        { url: 'https://x.test/b', text: longText },
      ],
    });
    const dup = out.issues.filter((i) => i.issueCode === IssueCode.DUPLICATE_CONTENT);
    expect(dup.length).toBeGreaterThan(0);
    const meta = dup[0]?.meta as { similarity: number };
    expect(meta.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it('respects custom thresholds when overridden', () => {
    const out = runCrossPageChecks({
      pageTexts: [
        { url: 'https://x.test/a', text: 'tiny' }, // 1 word
        { url: 'https://x.test/b', text: 'word '.repeat(50) }, // 50 words
      ],
      thinContentThreshold: 10,
    });
    // Now 'a' is < 10 words and SHOULD trigger; 'b' is 50, threshold is 10 → no flag.
    const thin = out.issues.filter((i) => i.issueCode === IssueCode.THIN_CONTENT);
    expect(thin.length).toBe(1);
    expect(thin[0]?.resourceUrl).toBe('https://x.test/a');
  });
});
