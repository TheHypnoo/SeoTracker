import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const uniqueRunId = `${Date.now()}-${process.pid}`;
const user = {
  email: `frontend-e2e-${uniqueRunId}@seotracker.test`,
  name: 'Frontend E2E User',
  password: 'Frontend12345',
};

function collectBrowserErrors(page: Page) {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  return browserErrors;
}

function waitForRegisterPost(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/register') && response.request().method() === 'POST',
  );
}

test('registers, opens the protected app shell, persists the session, and logs out', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto('/register');
  await page.locator('#register-name').fill(user.name);
  await page.locator('#register-email').fill(user.email);
  await page.locator('#register-password').fill(user.password);
  await page.locator('#register-confirm').fill(user.password);
  await expect(page.locator('#register-email')).toHaveValue(user.email);

  const registerResponsePromise = waitForRegisterPost(page);
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  const registerResponse = await registerResponsePromise;
  expect(registerResponse.ok()).toBe(true);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Panel de control' })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Secciones' });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Panel de control', exact: true }),
  ).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Dominios', exact: true })).toBeVisible();

  await navigation.getByRole('link', { name: 'Equipo', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/team$/);
  await expect(page.getByRole('heading', { name: 'Miembros del proyecto' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Miembros del proyecto' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();

  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Acceder' })).toBeVisible();

  expect(browserErrors).toStrictEqual([]);
});
