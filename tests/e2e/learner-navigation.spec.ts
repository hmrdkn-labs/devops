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
    const brand = page.getByRole('link', { name: 'DevOps by hmrdkn-labs home' });
    const brandMark = brand.locator('img.brand-mark');
    await expect(brandMark).toBeVisible();
    await expect(brandMark).toHaveAttribute('alt', '');
    await expect(page.locator('img.home-welcome-mark')).toBeVisible();
    await expect(page.getByRole('link', { name: 'See the concrete example' })).toHaveAttribute('href', '/learn/container-lifecycle?mode=reference');
    const targets = await brand.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
    expect(targets.width).toBeGreaterThanOrEqual(44);
    expect(targets.height).toBeGreaterThanOrEqual(44);
    const mark = await brandMark.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
    expect(mark).toEqual({ width: 32, height: 32 });
    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(favicon).toMatch(/\.png$/);
    await expect(page.locator('[data-session-action]')).toContainText('Start learning');
    await expect(page.locator('[data-session-action]')).toHaveAttribute('href', /^\/learn\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[data-session-action]').click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/?\?mode=reference$/);
    await expect(page.getByTestId('reader-workspace')).toBeVisible();
    await expect(page.getByTestId('practice-workspace')).toBeHidden();
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
    else {
      const guidedIntro = page.locator('.guided-model-reading, .scheduling-reading');
      await expect(guidedIntro).toBeVisible();
      await expect(guidedIntro.getByRole('button')).toBeEnabled();
      await expect(page.locator('.guided-model, .scheduling-prototype')).toContainText('Step 1 of 5');
    }
    if (!selector.includes('/lesson/')) await expect(page.locator('.site-nav [aria-current="page"], .mobile-dock [aria-current="page"]').filter({ visible: true })).toHaveText('Practice');
  }
});

test('optimized beaver assets load and decode on static and server-rendered layouts', async ({ page, request }) => {
  for (const path of ['/', '/dashboard']) {
    await page.goto(path);
    const brandMark = page.locator('img.brand-mark');
    await expect(brandMark).toBeVisible();
    await expect(brandMark).toHaveAttribute('srcset', / 2x/);

    const imageState = await brandMark.evaluate(async (image) => {
      await (image as HTMLImageElement).decode();
      return {
        complete: (image as HTMLImageElement).complete,
        naturalWidth: (image as HTMLImageElement).naturalWidth,
        naturalHeight: (image as HTMLImageElement).naturalHeight,
        src: (image as HTMLImageElement).currentSrc,
      };
    });
    expect(imageState).toMatchObject({ complete: true, naturalWidth: 32, naturalHeight: 32 });
    const imageResponse = await request.get(imageState.src);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toContain('image/png');
    expect((await imageResponse.body()).byteLength).toBeLessThan(1_082_749);

    const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(faviconHref).not.toBeNull();
    const faviconUrl = new URL(faviconHref!, page.url()).href;
    const faviconResponse = await request.get(faviconUrl);
    expect(faviconResponse.status()).toBe(200);
    expect(faviconResponse.headers()['content-type']).toContain('image/png');
    expect((await faviconResponse.body()).byteLength).toBeLessThan(1_082_749);
    const faviconSize = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, faviconUrl);
    expect(faviconSize).toEqual({ width: 64, height: 64 });
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
