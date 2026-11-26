import { expect, test } from '@playwright/test';

test('home reaches a question input in one click, without an account', async ({ page }, testInfo) => {
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/me', (route) => route.fulfill({ json: { authenticated: false, authConfigured: true, user: null } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Free, open Kubernetes exam prep');
  await expect(page.locator('.auth-menu')).toHaveCount(1);
  await expect(page.locator('.auth-popover')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Account/ })).toHaveCount(0);

  const start = page.locator('[data-session-action]');
  await expect(start).toContainText('Start learning');
  await expect(start).toHaveAttribute('href', /^\/learn\/(?!kcna-domain-map)[^/?]+$/);
  await page.screenshot({ path: testInfo.outputPath('home.png') });

  await start.click();
  await expect(page).toHaveURL(/\/learn\/[^/?]+\/?$/);
  const answer = page.getByRole('textbox', { name: 'Your explanation', exact: true });
  await expect(answer).toBeVisible();
  await expect(answer).toBeEnabled();
});
