import { describe, expect, it } from 'vitest';

import { activityDot, statusLabel, statusTone } from './dashboard-helpers';

describe('dashboard helpers', () => {
  it('maps audit statuses to Spanish labels and badge tones', () => {
    expect(
      ['COMPLETED', 'RUNNING', 'FAILED', 'QUEUED'].map((status) => [
        statusLabel(status),
        statusTone(status),
      ]),
    ).toStrictEqual([
      ['Completado', 'success'],
      ['Ejecutando', 'info'],
      ['Error', 'danger'],
      ['En cola', 'warning'],
    ]);
  });

  it('derives activity dot colors from permissive event kind strings', () => {
    expect(
      [
        'audit.failed.critical',
        'rank.regression.detected',
        'audit.completed',
        'member.invited',
        'site.created',
      ].map(activityDot),
    ).toStrictEqual([
      'bg-rose-500',
      'bg-amber-500',
      'bg-emerald-500',
      'bg-indigo-500',
      'bg-sky-500',
    ]);
  });
});
