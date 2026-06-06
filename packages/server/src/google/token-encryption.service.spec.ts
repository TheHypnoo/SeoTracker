import { describe, expect, it } from '@jest/globals';

import { TokenEncryptionService } from './token-encryption.service';

describe('token encryption service', () => {
  const service = new TokenEncryptionService();
  const key = 'k'.repeat(48);

  it('encrypts and decrypts a token without exposing plaintext', () => {
    const encrypted = service.encrypt('secret-access-token', key);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('secret-access-token');
    expect(service.decrypt(encrypted, key)).toBe('secret-access-token');
  });

  it('uses a random IV for every encryption', () => {
    expect(service.encrypt('same-token', key)).not.toBe(service.encrypt('same-token', key));
  });

  it('rejects short encryption keys and invalid payloads', () => {
    expect(() => service.encrypt('token', 'too-short')).toThrow(/at least 32 characters/);
    expect(() => service.decrypt('not-a-valid-payload', key)).toThrow(/Invalid encrypted token/);
  });
});
