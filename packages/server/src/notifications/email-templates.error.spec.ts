import { describe, expect, it, jest } from '@jest/globals';

jest.mock<typeof import('mjml')>('mjml', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    errors: [{ formattedMessage: 'Invalid MJML from mock' }],
    html: '',
  })),
}));

import { EmailTemplateError, renderPasswordResetEmail } from './email-templates';

describe('email templates mjml errors', () => {
  it('wraps mjml validation errors in EmailTemplateError', async () => {
    await expect(
      renderPasswordResetEmail({
        resetUrl: 'https://app.example.com/reset',
        ttlMinutes: 15,
        userName: 'Sergi',
      }),
    ).rejects.toThrow(EmailTemplateError);

    await expect(
      renderPasswordResetEmail({
        resetUrl: 'https://app.example.com/reset',
        ttlMinutes: 15,
        userName: 'Sergi',
      }),
    ).rejects.toThrow('Invalid MJML from mock');
  });
});
