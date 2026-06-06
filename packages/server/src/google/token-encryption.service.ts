import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const VERSION = 'v1';

@Injectable()
export class TokenEncryptionService {
  encrypt(plaintext: string, rawKey: string): string {
    const key = this.deriveKey(rawKey);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string, rawKey: string): string {
    const [version, ivRaw, tagRaw, encryptedRaw] = payload.split('.');
    if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new Error('Invalid encrypted token payload');
    }

    const key = this.deriveKey(rawKey);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, 'base64url'), {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf-8');
  }

  private deriveKey(rawKey: string): Buffer {
    const trimmed = rawKey.trim();
    if (trimmed.length < 32) {
      throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be at least 32 characters');
    }

    return createHash('sha256').update(trimmed).digest();
  }
}
