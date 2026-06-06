import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface GoogleOauthStatePayload {
  projectId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class GoogleOauthStateService {
  create(
    input: { projectId: string; userId: string; ttlMs?: number },
    signingSecret: string,
  ): string {
    const payload: GoogleOauthStatePayload = {
      projectId: input.projectId,
      userId: input.userId,
      nonce: randomBytes(16).toString('base64url'),
      expiresAt: Date.now() + (input.ttlMs ?? 10 * 60 * 1000),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const signature = this.sign(encodedPayload, signingSecret);
    return `${encodedPayload}.${signature}`;
  }

  verify(state: string, signingSecret: string): GoogleOauthStatePayload {
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) {
      throw new BadRequestException('Invalid OAuth state');
    }

    const expected = this.sign(encodedPayload, signingSecret);
    if (!this.safeEqual(signature, expected)) {
      throw new BadRequestException('Invalid OAuth state signature');
    }

    let payload: GoogleOauthStatePayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf-8'),
      ) as GoogleOauthStatePayload;
    } catch {
      throw new BadRequestException('Invalid OAuth state payload');
    }

    if (!payload.projectId || !payload.userId || !payload.nonce || !payload.expiresAt) {
      throw new BadRequestException('Invalid OAuth state payload');
    }
    if (payload.expiresAt < Date.now()) {
      throw new BadRequestException('OAuth state expired');
    }

    return payload;
  }

  private sign(encodedPayload: string, signingSecret: string): string {
    return createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
