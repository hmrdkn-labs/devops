import { expect, test } from '@playwright/test';

const primarySurfaces = [
  ['home', '/'],
  ['kcna-path', '/paths/kcna'],
  ['study', '/learn/kcna-kubernetes-resources-review'],
  ['library', '/library'],
  ['search', '/search'],
  ['map', '/map'],
] as const;

test('UI v3 primary surfaces stay compact, readable, and overflow-free', async ({ page }, testInfo) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((nextTheme) => localStorage.setItem('hmrdkn-theme', nextTheme), theme);

    for (const [name, route] of primarySurfaces) {
      await page.goto(route);

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(overflow.documentWidth, `${route} must not overflow horizontally`).toBeLessThanOrEqual(overflow.viewportWidth);

      const screenshotPath = testInfo.outputPath(`${name}-${theme}-${testInfo.project.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
      await testInfo.attach(`${name}-${theme}-${testInfo.project.name}`, { path: screenshotPath, contentType: 'image/png' });
    }
  }
});

test('study question is visible in the initial viewport', async ({ page }) => {
  await page.goto('/learn/kcna-kubernetes-resources-review');
  const question = page.locator('.question-stage h2').first();
  await expect(question).toBeVisible();

  const box = await question.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y + box!.height, 'question should be fully visible before scrolling').toBeLessThan(viewport!.height);
});

test('display headings stay within the workspace type scale', async ({ page }) => {
  await page.goto('/');
  const homeSize = await page.locator('.home-heading h1').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(homeSize).toBeLessThanOrEqual(40);

  await page.goto('/references');
  const pageSize = await page.locator('.page-hero h1').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(pageSize).toBeLessThanOrEqual(40);
});

test('mobile header actions meet the 44px touch-target contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only interaction contract');
  await page.goto('/');

  for (const selector of ['.theme-toggle', '.auth-popover > summary', '.mobile-nav > summary']) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width, `${selector} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  }
});
