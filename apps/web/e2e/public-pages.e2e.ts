import { expect, test } from '@playwright/test';

const publicPages = [
  {
    path: '/',
    heading: 'El SEO técnico de tu sitio, bajo vigilancia continua.',
    checks: ['Acceder', 'Crear cuenta'],
  },
  {
    path: '/login',
    heading: 'Bienvenido de nuevo',
    checks: ['Correo electrónico', 'Contraseña', 'Iniciar sesión'],
  },
  {
    path: '/register',
    heading: 'Crear una cuenta',
    checks: ['Nombre completo', 'Correo electrónico', 'Contraseña'],
  },
  {
    path: '/forgot-password',
    heading: 'Recuperar contraseña',
    checks: ['Correo electrónico', 'Enviar enlace'],
  },
] as const;

for (const pageCase of publicPages) {
  test(`${pageCase.path} renders without browser errors`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text());
      }
    });

    await page.goto(pageCase.path);

    await expect(page.getByRole('heading', { name: pageCase.heading })).toBeVisible();
    for (const text of pageCase.checks) {
      await expect(page.getByText(text).first()).toBeVisible();
    }
    expect(browserErrors).toStrictEqual([]);
  });
}
