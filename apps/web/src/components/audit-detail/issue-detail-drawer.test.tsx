import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { IssueGroup } from './audit-detail-types';
import { IssueDetailDrawer } from './issue-detail-drawer';

describe('IssueDetailDrawer', () => {
  it('wraps long occurrence URLs instead of truncating them', () => {
    const longUrl =
      'https://b2box.app/cdn-cgi/content?id=3tBWjGbLrxphL6U4c1PypPXMPNeEw1H9rPgCfRjO2N4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const group: IssueGroup = {
      allIgnored: false,
      anyIgnored: false,
      category: 'CRAWLABILITY',
      code: 'META_NOINDEX',
      firstSeenAt: null,
      items: [
        {
          category: 'CRAWLABILITY',
          firstSeenAt: null,
          id: 'issue-1',
          issueCode: 'META_NOINDEX',
          lastSeenAt: null,
          message: 'Page has noindex directive',
          meta: { source: 'meta', content: 'noindex' },
          projectIssueId: 'project-issue-1',
          resourceUrl: longUrl,
          severity: 'CRITICAL',
          state: 'OPEN',
        },
      ],
      lastSeenAt: null,
      severity: 'CRITICAL',
    };

    render(
      <IssueDetailDrawer
        group={group}
        isPending={false}
        onBulkChangeState={vi.fn()}
        onChangeState={vi.fn()}
        onClose={vi.fn()}
        evidenceSummary="meta: noindex"
      />,
    );

    const urlNode = screen.getByText(longUrl);

    expect(urlNode.className).toContain('break-all');
    expect(urlNode.className).not.toContain('truncate');
    expect(screen.getByText('Evidencia detectada')).toBeTruthy();
  });
});
