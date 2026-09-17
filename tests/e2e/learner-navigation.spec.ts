import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/me', (route) => route.fulfill({ json: { authenticated: false, authConfigured: false, user: null } }));
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
});

test('Learn starts a unit and each viewport exposes one primary navigation', async ({ page }) => {
  test.slow();
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const navigation = width <= 760 ? page.locator('.mobile-dock') : page.locator('.site-nav');
    const hiddenNavigation = width <= 760 ? page.locator('.site-nav') : page.locator('.mobile-dock');
    await expect(navigation).toBeVisible();
    await expect(hiddenNavigation).toBeHidden();
    await expect(navigation.locator('a')).toHaveText(['Learn', 'Review', 'Practice', 'Library']);
    await expect(navigation.locator('[aria-current="page"]')).toHaveText('Learn');
    await expect(page.getByRole('link', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.locator('.mobile-nav')).toHaveCount(0);
    await expect(page.locator('[data-session-action]')).toContainText('Start learning');
    await expect(page.locator('[data-session-action]')).toHaveAttribute('href', /^\/learn\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[data-session-action]').click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/?$/);
    await expect(page.getByRole('textbox', { name: 'Your explanation', exact: true })).toBeVisible();
    for (const label of ['Learn', 'Review', 'Practice', 'Library']) {
      // Study is immersive; return to the shared navigation before exercising it.
      if (label === 'Learn') await page.goto('/');
      await navigation.getByRole('link', { name: label, exact: true }).click();
      await expect(navigation.locator('[aria-current="page"]')).toHaveText(label);
      await expect(navigation).toBeVisible();
      await expect(hiddenNavigation).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test('Practice and Library expose existing activities and lookup routes', async ({ page }) => {
  test.slow();
  await page.goto('/practice');
  await expect(page.locator('a.activity-card[href^="/lesson/"]')).toHaveCount(4);
  await expect(page.locator('a.activity-card[href^="/models/"]')).toHaveCount(3);
  await expect(page.locator('a.activity-card[href="/practice/kcna"]')).toBeVisible();
  await expect(page.locator('.site-nav [aria-current="page"], .mobile-dock [aria-current="page"]').filter({ visible: true })).toHaveText('Practice');
  await page.goto('/library');
  for (const href of ['/search', '/map', '/references']) {
    await expect(page.locator(`.entry-links a[href="${href}"]`)).toBeVisible();
  }
  await expect(page.locator('.library-card')).toHaveCount(40);
  await expect(page.locator('.library-portability a[href="/devops-content-v1.zip"]')).toBeVisible();
  for (const href of ['/search', '/map', '/references']) {
    await page.goto('/library');
    await page.locator(`.entry-links a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}/?$`));
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('.site-nav [aria-current="page"], .mobile-dock [aria-current="page"]').filter({ visible: true })).toHaveText('Library');
  }
  for (const selector of ['a.activity-card[href="/practice/kcna"]', 'a.activity-card[href^="/lesson/"]', 'a.activity-card[href^="/models/"]']) {
    await page.goto('/practice');
    const link = page.locator(selector).first();
    const href = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}/?$`));
    if (selector.includes('/practice/kcna')) await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeVisible();
    else if (selector.includes('/lesson/')) await expect(page.getByTestId('lesson-active-task')).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Check prediction & reveal', exact: true })).toBeVisible();
    if (!selector.includes('/lesson/')) await expect(page.locator('.site-nav [aria-current="page"], .mobile-dock [aria-current="page"]').filter({ visible: true })).toHaveText('Practice');
  }
});

test('Account loading and unavailable network recover to owner without guest claims or crashes', async ({ page }) => {
  let release!: () => void;
  let started = false;
  let requests = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/me', async (route) => {
    requests++;
    if (requests === 1) {
      started = true;
      await pending;
      await route.abort('failed');
    } else await route.fulfill({ json: { authenticated: true, authConfigured: true, user: { id: 'test:owner', name: 'Test owner' } } });
  });
  await page.goto('/');
  await expect.poll(() => started).toBe(true);
  const summary = page.locator('.auth-popover > summary');
  await expect(summary).toHaveText('Account');
  await summary.click();
  await expect(page.locator('.auth-menu')).toContainText('Checking account…');
  await expect(page.locator('.auth-menu')).not.toContainText('Guest');
  release();
  await expect(page.locator('.auth-menu')).toContainText('Account status is unavailable');
  await expect(summary).toHaveText('Account');
  await expect(page.locator('.auth-menu')).not.toContainText('Guest');
  await page.getByRole('button', { name: 'Retry account', exact: true }).click();
  await expect(page.locator('.owner-chip')).toHaveText('Account');
  // The owner popover is a new disclosure after recovery.
  if (await page.locator('.auth-popover').getAttribute('open') === null) await summary.click();
  await expect(page.locator('.account-name')).toHaveText('Test owner');
  await expect(page.locator('.auth-menu').getByRole('link', { name: 'Progress', exact: true })).toHaveAttribute('href', '/dashboard');
  await expect(page.locator('.auth-menu').getByRole('link', { name: 'Settings & export', exact: true })).toBeVisible();
  await expect(page.locator('.auth-menu')).not.toContainText('Guest');
  expect(errors).toEqual([]);
});
