import { BadRequestException } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';

// Authoritative blocklist for SSRF protection. net.BlockList parses each IP
// numerically, so it cannot be fooled by alternate textual encodings
// (decimal/hex IPv4, or — critically — IPv4-mapped IPv6 such as
// `::ffff:7f00:1`, which is what `new URL()` normalizes `::ffff:127.0.0.1`
// into). A regex-based approach missed those mapped/hex forms and let loopback
// and the cloud metadata endpoint slip through.
const blockedRanges = new BlockList();
// IPv4
blockedRanges.addAddress('0.0.0.0'); // unspecified
blockedRanges.addSubnet('127.0.0.0', 8); // loopback
blockedRanges.addSubnet('10.0.0.0', 8); // private
blockedRanges.addSubnet('172.16.0.0', 12); // private
blockedRanges.addSubnet('192.168.0.0', 16); // private
blockedRanges.addSubnet('169.254.0.0', 16); // link-local + cloud metadata (169.254.169.254)
// IPv6
blockedRanges.addAddress('::1', 'ipv6'); // loopback
blockedRanges.addAddress('::', 'ipv6'); // unspecified
blockedRanges.addSubnet('fe80::', 10, 'ipv6'); // link-local
blockedRanges.addSubnet('fc00::', 7, 'ipv6'); // unique-local

export function isPrivateHostname(hostname: string): boolean {
  // Strip the IPv6 bracket form (`[::1]`) before classification.
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');

  if (normalized === 'localhost') {
    return true;
  }

  const family = isIP(normalized);
  if (family === 4) {
    return blockedRanges.check(normalized, 'ipv4');
  }
  if (family === 6) {
    // check() resolves IPv4-mapped IPv6 against the IPv4 rules automatically,
    // closing the `::ffff:<hex>` bypass.
    return blockedRanges.check(normalized, 'ipv6');
  }

  // Not an IP literal (a DNS name). It cannot be classified here; the caller
  // resolves it and re-checks every resolved address through this function.
  return false;
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
