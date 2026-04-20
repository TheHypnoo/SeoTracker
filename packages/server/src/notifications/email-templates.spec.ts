import { describe, expect, it } from '@jest/globals';

import {
  renderAuditCompletedEmail,
  renderAuditRegressionEmail,
  renderPasswordResetEmail,
  renderProjectInviteEmail,
} from './email-templates';

describe('email templates', () => {
  it('renders password reset email with responsive HTML and plain text', async () => {
    const email = await renderPasswordResetEmail({
      resetUrl: 'https://app.example.com/reset-password/token-123',
      ttlMinutes: 60,
      userName: 'Sergi',
    });

    expect(email.subject).toBe('SEOTracker - Recuperación de contraseña');
    expect(email.text).toContain('Restablece tu contraseña');
    expect(email.text).toContain('https://app.example.com/reset-password/token-123');
    expect(email.html).toContain('Restablecer contraseña');
    expect(email.html).toContain('https://app.example.com/reset-password/token-123');
  });

  it('renders project invites with role details', async () => {
    const email = await renderProjectInviteEmail({
      inviteUrl: 'https://app.example.com/invite/token-123',
      role: 'OWNER',
    });

    expect(email.subject).toBe('SEOTracker - Invitación al proyecto');
    expect(email.text).toContain('ROL ASIGNADO\nOWNER');
    expect(email.html).toContain('Rol asignado');
    expect(email.html).toContain('OWNER');
  });

  it('renders audit completed notifications', async () => {
    const completed = await renderAuditCompletedEmail({
      domain: 'example.com',
      issuesCount: 7,
      score: 84,
      siteName: 'Example',
    });

    expect(completed.text).toContain('SCORE FINAL\n84 / 100');
    expect(completed.html).toContain('Auditoría completada');
  });

  it('renders audit regression notifications with editorial signals', async () => {
    const regression = await renderAuditRegressionEmail({
      domain: 'example.com',
      signals: [
        {
          description: 'El score ha bajado 12 puntos desde la última auditoría.',
          detail: 'Umbral configurado: 10 puntos.',
          title: 'Score SEO en descenso',
          tone: 'danger',
        },
      ],
      siteName: 'Example',
    });

    expect(regression.text).toContain('Score SEO en descenso');
    expect(regression.text).toContain('El score ha bajado 12 puntos desde la última auditoría.');
    expect(regression.html).toContain('Regresión detectada');
    expect(regression.html).toContain('Motivos de la alerta');
    expect(regression.html).not.toContain('el score ha bajado 12 puntos');
  });

  it('escapes dynamic content in HTML output', async () => {
    const email = await renderPasswordResetEmail({
      resetUrl: 'https://app.example.com/reset?token=<bad>',
      ttlMinutes: 15,
      userName: '<script>alert(1)</script>',
    });

    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});
