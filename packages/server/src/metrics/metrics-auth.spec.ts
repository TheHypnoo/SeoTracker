import { describe, expect, it } from '@jest/globals';
import { evaluateMetricsAccess } from './metrics-auth';

describe('evaluateMetricsAccess', () => {
  it('allows public metrics in non-production without a token', () => {
    expect(evaluateMetricsAccess({ nodeEnv: 'development' })).toBe('allow');
  });

  it('hides metrics in production when no token is configured', () => {
    expect(evaluateMetricsAccess({ nodeEnv: 'production' })).toBe('not-found');
  });

  it('requires a token when configured', () => {
    expect(
      evaluateMetricsAccess({
        configuredToken: '1234567890abcdef',
        nodeEnv: 'production',
      }),
    ).toBe('unauthorized');
  });

  it('accepts the configured bearer token', () => {
    expect(
      evaluateMetricsAccess({
        authorization: 'Bearer 1234567890abcdef',
        configuredToken: '1234567890abcdef',
        nodeEnv: 'production',
      }),
    ).toBe('allow');
  });

  it('accepts x-metrics-token', () => {
    expect(
      evaluateMetricsAccess({
        configuredToken: '1234567890abcdef',
        metricsTokenHeader: '1234567890abcdef',
        nodeEnv: 'production',
      }),
    ).toBe('allow');
  });
});
