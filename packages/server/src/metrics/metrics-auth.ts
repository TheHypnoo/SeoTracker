import { timingSafeEqual } from 'node:crypto';

export type MetricsAccessDecision = 'allow' | 'not-found' | 'unauthorized';

interface MetricsAccessInput {
  nodeEnv: string;
  configuredToken?: string;
  authorization?: string | string[];
  metricsTokenHeader?: string | string[];
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function extractBearerToken(authorization: string | string[] | undefined): string | undefined {
  const value = firstHeaderValue(authorization);
  if (!value) {
    return undefined;
  }

  const [scheme, token] = value.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token.trim();
}

function tokenMatches(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

export function evaluateMetricsAccess(input: MetricsAccessInput): MetricsAccessDecision {
  const configuredToken = input.configuredToken?.trim();

  if (!configuredToken) {
    return input.nodeEnv === 'production' ? 'not-found' : 'allow';
  }

  const suppliedToken =
    extractBearerToken(input.authorization) ?? firstHeaderValue(input.metricsTokenHeader)?.trim();

  if (!suppliedToken) {
    return 'unauthorized';
  }

  return tokenMatches(suppliedToken, configuredToken) ? 'allow' : 'unauthorized';
}
