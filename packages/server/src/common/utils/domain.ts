import { BadRequestException } from '@nestjs/common';

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  // IPv4 link-local + AWS/GCP/Azure metadata endpoint (169.254.169.254)
  /^169\.254\./,
  // IPv6 loopback / unspecified
  /^\[?::1\]?$/i,
  /^\[?::\]?$/i,
  // IPv4-mapped IPv6 private ranges
  /^\[?::ffff:0\.0\.0\.0/i,
  /^\[?::ffff:127\./i,
  /^\[?::ffff:10\./i,
  /^\[?::ffff:192\.168\./i,
  /^\[?::ffff:172\.(1[6-9]|2\d|3[0-1])\./i,
  /^\[?::ffff:169\.254\./i,
  // IPv6 link-local (fe80::/10)
  /^\[?fe[89ab][0-9a-f]:/i,
  // IPv6 unique-local (fc00::/7)
  /^\[?f[cd][0-9a-f]{2}:/i,
];

export function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return PRIVATE_HOST_PATTERNS.some((regex) => regex.test(normalized));
}

export function assertPublicHostname(hostname: string, label = 'hostname') {
  if (!hostname) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  if (isPrivateHostname(hostname)) {
    throw new BadRequestException(`Private or local ${label}s are not allowed`);
  }
}

export function assertPublicHttpUrl(input: string, label = 'URL') {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new BadRequestException(`Invalid ${label}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(`${label} must use HTTP or HTTPS`);
  }

  assertPublicHostname(url.hostname, label);
  return url;
}

export function normalizeDomain(input: string) {
  const raw = input.trim().toLowerCase();
  const candidate =
    raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BadRequestException('Invalid domain');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.')) {
    throw new BadRequestException('Invalid domain');
  }

  if (isPrivateHostname(hostname)) {
    throw new BadRequestException('Private or local domains are not allowed');
  }

  return {
    domain: hostname,
    homepageUrl: `https://${hostname}`,
    normalizedDomain: hostname,
  };
}
