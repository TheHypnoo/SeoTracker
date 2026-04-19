import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

import {
  assertPublicHostname,
  assertPublicHttpUrl,
  isPrivateHostname,
  normalizeDomain,
} from './domain';

describe('normalizeDomain', () => {
  it('normalizes plain domain', () => {
    expect(normalizeDomain('example.com').normalizedDomain).toBe('example.com');
  });

  it('rejects localhost', () => {
    expect(() => normalizeDomain('localhost')).toThrow(BadRequestException);
  });
});

describe('isPrivateHostname', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.169.254',
    '169.254.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:192.168.1.1',
    '::ffff:172.16.0.1',
    '::ffff:169.254.169.254',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
  ])('flags %s as private', (host) => {
    expect(isPrivateHostname(host)).toBeTruthy();
  });

  it.each(['example.com', '8.8.8.8', '1.1.1.1', '173.0.0.1', '2001:4860:4860::8888'])(
    'flags %s as public',
    (host) => {
      expect(isPrivateHostname(host)).toBeFalsy();
    },
  );
});

describe('assertPublicHostname', () => {
  it('throws on private host', () => {
    expect(() => assertPublicHostname('169.254.169.254')).toThrow(BadRequestException);
  });

  it('throws on empty host', () => {
    expect(() => assertPublicHostname('')).toThrow(BadRequestException);
  });

  it('does not throw on public host', () => {
    expect(() => assertPublicHostname('example.com')).not.toThrow();
  });
});

describe('assertPublicHttpUrl', () => {
  it('accepts public HTTP and HTTPS URLs', () => {
    expect(assertPublicHttpUrl('https://example.com/hook').hostname).toBe('example.com');
    expect(assertPublicHttpUrl('http://example.com/hook').protocol).toBe('http:');
  });

  it('rejects non-HTTP protocols', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(BadRequestException);
  });

  it('rejects private hosts', () => {
    expect(() => assertPublicHttpUrl('https://127.0.0.1/hook')).toThrow(BadRequestException);
  });
});
