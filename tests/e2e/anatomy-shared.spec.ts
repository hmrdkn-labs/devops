import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { open } from './anatomy/helpers';

const slugs = readdirSync('content/anatomy').filter((file) => file.endsWith('.yaml')).map((file) => file.slice(0, -5));

// One screen on desktop: after the page's primary interaction, the object, the primary control,
// the change report and the per-object status region are all visible below the sticky header.
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const slug of slugs) {
    test(`${slug}: one ${viewport.width}x${viewport.height} screen shows object, action, change report and status`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'desktop workbench layout');
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const figure = await open(page, slug);
      test.skip(await figure.locator('.anatomy-bench').count() === 0, 'page not yet on the workbench layout');
      const primary = figure.locator('[data-anatomy-primary]').first();
      await primary.click();
      await expect(figure.locator('.anatomy-change')).toHaveAttribute('aria-busy', 'false');
      await figure.locator('.anatomy-bench').evaluate((bench) => {
        const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
        window.scrollBy(0, bench.getBoundingClientRect().top - header - 8);
      });
      const header = await page.evaluate(() => document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0);
      for (const [name, locator] of [
        ['object', figure.locator('.anatomy-bench-object svg.iso-svg').first()],
        ['primary control', primary],
        ['change report', figure.locator('.anatomy-change')],
        ['status', figure.locator('[data-anatomy-status]').first()],
      ] as const) {
        const box = await locator.boundingBox();
        expect(box, `${name} is rendered`).not.toBeNull();
        expect(box!.y, `${name} top is below the header`).toBeGreaterThanOrEqual(header - 1);
        expect(box!.y + box!.height, `${name} bottom fits the ${viewport.height}px screen`).toBeLessThanOrEqual(viewport.height + 1);
      }
    });
  }
}

test('delayed hydration keeps the original object readable and controls inert', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/_astro\/Figure\.[^/]+\.js$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto('/anatomy/node-affinity/', { waitUntil: 'commit' });
  const figure = page.locator('.affinity-sorter');
  try {
    await expect.poll(() => held).toBe(true);
    await expect(figure).toHaveAttribute('aria-busy', 'true');
    await expect(figure.getByRole('img')).toBeVisible();
    const step = figure.getByRole('button', { name: 'Evaluate node requirements', exact: true });
    await expect(step).toBeDisabled();
    const before = await figure.locator('.anatomy-change').textContent();
    await step.evaluate((element) => (element as HTMLButtonElement).click());
    expect(await figure.locator('.anatomy-change').textContent()).toBe(before);
    const object = await figure.boundingBox();
    const explanation = await page.locator('.anatomy-explanation').boundingBox();
    expect(object).not.toBeNull();
    expect(explanation).not.toBeNull();
    expect(explanation!.y).toBeGreaterThanOrEqual(object!.y + object!.height);
  } finally { release(); }
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(figure.getByRole('button', { name: 'Evaluate node requirements', exact: true })).toBeEnabled();
});

test('related Anatomy exploration preserves the current learner draft', async ({ page }) => {
  await page.goto('/learn/kubernetes-architecture-components/');
  const draft = page.getByRole('textbox', { name: 'Your explanation', exact: true });
  await draft.fill('The scheduler binds a Pod; node-side components execute it.');
  const link = page.locator('.anatomy-discovery a[href="/anatomy/cluster-responsibilities/"]');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup.locator('.cluster-console')).toHaveAttribute('aria-busy', 'false');
  await popup.close();
  await expect(draft).toHaveValue('The scheduler binds a Pod; node-side components execute it.');
});

test('phone explanations keep tables and long field names inside the reading surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const slug of slugs) {
    await open(page, slug);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await open(page, 'replica-reconciliation');
  const table = page.locator('.reference-table-scroll').first();
  await table.focus();
  await table.press('ArrowRight');
  await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
