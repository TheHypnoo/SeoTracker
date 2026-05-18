import { describe, expect, it } from '@jest/globals';

import {
  renderAuditCompletedEmail,
  renderAuditRegressionEmail,
  renderPasswordResetEmail,
  renderProjectInviteEmail,
  renderLayout,
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

  it('renders audit completed zero-issue and danger-score variants', async () => {
    const completed = await renderAuditCompletedEmail({
      domain: 'low.example.com',
      issuesCount: 0,
      score: 42,
      siteName: 'Low Score',
    });

    expect(completed.text).toContain('Sin problemas detectados. Todo en verde.');
    expect(completed.text).toContain('42 / 100');
    expect(completed.html).toContain('low.example.com');
  });

  it('renders warning-only regression notifications without signal details', async () => {
    const regression = await renderAuditRegressionEmail({
      domain: 'example.com',
      signals: [
        {
          description: 'El número de avisos ha aumentado.',
          title: 'Más avisos detectados',
          tone: 'warning',
        },
      ],
      siteName: 'Example',
    });

    expect(regression.text).toContain('1 Aviso');
    expect(regression.text).toContain('Más avisos detectados: El número de avisos ha aumentado.');
    expect(regression.subject).toBe('SEOTracker - Regresión detectada (Example)');
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

  it('renders a custom metric-heavy layout with all plain text fallbacks', async () => {
    const email = await renderLayout({
      badge: 'Resumen',
      body: ['Primera línea.', 'Segunda línea.'],
      details: [{ label: 'Dominio', value: 'example.com' }],
      eyebrow: 'Reporte',
      intro: 'Resumen mensual.',
      metrics: [
        { label: 'Score', value: '91', detail: '+4 pts', tone: 'success' },
        { label: 'Issues', value: '0', tone: 'neutral' },
      ],
      preview: 'Preview custom.',
      spotlight: {
        bar: { percent: 125, tone: 'success' },
        caption: 'Por encima del objetivo.',
        eyebrow: 'Progreso',
        pills: [
          { count: 2, label: 'Ganancias', tone: 'success' },
          { label: 'Sin regresiones', tone: 'neutral' },
        ],
        primary: '91',
        primarySize: 'md',
        primarySuffix: '/ 100',
        tone: 'success',
      },
      subject: 'SEOTracker - Resumen custom',
      title: 'Resumen custom',
      tone: 'success',
    });

    expect(email.text).toContain('Score: 91 (+4 pts)');
    expect(email.text).toContain('Issues: 0');
    expect(email.text).toContain('2 Ganancias · Sin regresiones');
    expect(email.text).toContain('Progreso: 100%');
    expect(email.html).toContain('Resumen custom');
  });

  it('renders layouts with minimal spotlight values and no optional arrays', async () => {
    const email = await renderLayout({
      badge: 'Aviso',
      eyebrow: 'Sistema',
      intro: 'Mensaje sin secciones opcionales.',
      preview: 'Preview.',
      spotlight: {
        pills: [{ label: 'Pendiente', tone: 'warning' }],
        tone: 'warning',
      },
      subject: 'SEOTracker - Aviso',
      title: 'Aviso simple',
      tone: 'warning',
    });

    expect(email.text).toContain('Aviso simple');
    expect(email.text).toContain('Pendiente');
    expect(email.text).not.toContain('undefined');
  });

  it('renders layouts without spotlight content', async () => {
    const email = await renderLayout({
      badge: 'Info',
      eyebrow: 'Sistema',
      intro: 'Mensaje sin spotlight.',
      preview: 'Preview.',
      subject: 'SEOTracker - Info',
      title: 'Sin spotlight',
      tone: 'success',
    });

    expect(email.text).toContain('Sin spotlight');
    expect(email.html).toContain('Sin spotlight');
  });

  it('renders successful score and plural issue variants', async () => {
    const completed = await renderAuditCompletedEmail({
      domain: 'great.example.com',
      issuesCount: 1,
      score: 95,
      siteName: 'Great Score',
    });

    expect(completed.text).toContain('95 / 100');
    expect(completed.text).toContain('1 problema detectado.');
  });
});
