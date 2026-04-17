import nodemailer from 'nodemailer';

import {
  renderAuditCompletedEmail,
  renderAuditRegressionEmail,
  renderPasswordResetEmail,
  renderProjectInviteEmail,
} from '../dist/notifications/email-templates.js';

function envString(key, fallback) {
  const value = process.env[key];
  return value && value.trim() ? value : fallback;
}

const to = process.argv.slice(2).find((argument) => argument !== '--') ?? 'local-user@example.com';
const host = envString('SMTP_HOST', 'localhost');
const port = Number(envString('SMTP_PORT', '1025'));
const secure = envString('SMTP_SECURE', 'false') === 'true';
const user = envString('SMTP_USER', '');
const pass = envString('SMTP_PASS', '');

const transporter = nodemailer.createTransport({
  auth: user && pass ? { pass, user } : undefined,
  host,
  port,
  secure,
});

const samples = [
  await renderPasswordResetEmail({
    resetUrl: 'http://localhost:3000/reset-password/local-preview-token',
    ttlMinutes: 60,
    userName: 'Sergi',
  }),
  await renderProjectInviteEmail({
    inviteUrl: 'http://localhost:3000/invite/local-preview-token',
    role: 'MEMBER',
  }),
  await renderAuditCompletedEmail({
    domain: 'example.com',
    issuesCount: 7,
    score: 84,
    siteName: 'Example',
  }),
  await renderAuditRegressionEmail({
    domain: 'example.com',
    signals: [
      {
        description: 'El score ha bajado 12 puntos desde la última auditoría.',
        detail: 'Umbral configurado: 10 puntos.',
        title: 'Score SEO en descenso',
        tone: 'danger',
      },
      {
        description: 'Se han detectado 2 incidencias críticas que antes no estaban presentes.',
        title: 'Nuevas incidencias críticas',
        tone: 'danger',
      },
    ],
    siteName: 'Example',
  }),
];

for (const email of samples) {
  await transporter.sendMail({
    from: envString('SMTP_FROM', 'SEOTracker <no-reply@seotracker.local>'),
    html: email.html,
    subject: `[Preview] ${email.subject}`,
    text: email.text,
    to,
  });
}

console.log(`Sent ${samples.length} preview emails to ${to} through ${host}:${port}`);
