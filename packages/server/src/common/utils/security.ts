import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(size = 48) {
  return randomBytes(size).toString('hex');
}

export function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
