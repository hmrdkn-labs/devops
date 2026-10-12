import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const sync = (figure: Locator) =>
  figure.getByRole('button', { name: 'Kubelet sync (mounted files only)', exact: true });
const roll = (figure: Locator) =>
  figure.getByRole('button', { name: 'Roll out template (new Pod)', exact: true });

test('an environment value is fixed at container start, whatever the ConfigMap now holds', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  const report = figure.locator('.anatomy-change');
  const readout = figure.locator('.anatomy-readout');
  await expect(readout).toContainText('LOG_LEVEL=info (fixed at start)');
  await figure.getByRole('button', { name: 'Update ConfigMap value to debug', exact: true }).click();
  await expect(report).toContainText('Stored value changed from info to debug.');
  await expect(report).toContainText('env values are fixed when its container starts');
  await expect(readout).toContainText('LOG_LEVEL=info (fixed at start)');
  await sync(figure).click();
  await expect(report).toContainText('Kubelet sync: environment unchanged');
  await roll(figure).click();
  await expect(report).toContainText('running; fixture retires');
  await expect(readout).toContainText('LOG_LEVEL=debug (fixed at start)');
});

test('a mounted file changes only at kubelet sync, and only for the Pod that mounted it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  const report = figure.locator('.anatomy-change');
  const readout = figure.locator('.anatomy-readout');
  await figure.getByRole('radio', { name: 'Mounted volume', exact: true }).check();
  await expect(report).toContainText('Staged template changed; running Pod unchanged');
  await expect(readout).toContainText('staged template not rolled out');
  await roll(figure).click();
  await expect(readout).toContainText('file log-level=info (updates at sync)');
  await figure.getByRole('button', { name: 'Update ConfigMap value to debug', exact: true }).click();
  await expect(report).toContainText('Stored value changed from info to debug.');
  await expect(report).toContainText('mounted file still reads info; it updates only after a kubelet sync');
  await expect(readout).toContainText('file log-level=info');
  await sync(figure).click();
  await expect(report).toContainText('Kubelet sync: mounted file now debug');
  await expect(readout).toContainText('file log-level=debug');
});

test('a subPath copy never receives an update, even after sync', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  const report = figure.locator('.anatomy-change');
  const readout = figure.locator('.anatomy-readout');
  await figure.getByRole('radio', { name: 'subPath mount', exact: true }).check();
  await expect(report).toContainText('Staged template changed; running Pod unchanged');
  await roll(figure).click();
  await expect(readout).toContainText('subPath copy=info (never updates)');
  await figure.getByRole('button', { name: 'Update ConfigMap value to debug', exact: true }).click();
  await expect(report).toContainText('Stored value changed from info to debug.');
  await sync(figure).click();
  await expect(report).toContainText('subPath copy still shows info');
  await expect(readout).toContainText('subPath copy=info');
});

test('a replacement with a missing required key does not start; the active Pod keeps running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  const report = figure.locator('.anatomy-change');
  const readout = figure.locator('.anatomy-readout');
  const misspelled = figure.getByRole('checkbox', { name: /Reference a key the object does not hold/ });
  const blocked = figure.locator('.cs-card[data-object="blocked"]');
  await misspelled.check();
  await expect(report).toContainText('Staged template changed; running Pod unchanged');
  await roll(figure).click();
  await expect(report).toContainText('did not start');
  await expect(blocked).toContainText('Not started');
  await expect(readout).toContainText('LOG_LEVEL=info (fixed at start)');
  await misspelled.uncheck();
  await expect(report).toContainText('Staged template matches the running Pod');
  await roll(figure).click();
  await expect(blocked).toHaveCount(0);
  await expect(readout).toContainText('LOG_LEVEL=info (fixed at start)');
});

test('controls are keyboard operable; the in-progress state holds the actions until the result commits', async ({ page }) => {
  const figure = await open(page, 'config-secrets');
  const report = figure.locator('.anatomy-change');
  // Record every ChangeReport title with whether the action group is held, in commit order. Asserts order, not timing.
  await page.evaluate(() => {
    document.documentElement.dataset.commits = '';
    new MutationObserver(() => {
      const title = document.querySelector('.anatomy-change-title')?.textContent ?? '';
      const held = document.querySelector<HTMLFieldSetElement>('.cs-actions')?.disabled ?? false;
      document.documentElement.dataset.commits = `${document.documentElement.dataset.commits ?? ''}${title}|${held ? 'held' : 'free'}\n`;
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  const volume = figure.getByRole('radio', { name: 'Mounted volume', exact: true });
  await volume.focus();
  await page.keyboard.press('Space');
  await expect(volume).toBeChecked();
  await expect(report).toContainText('Staged template changed; running Pod unchanged');
  await sync(figure).focus();
  await page.keyboard.press('Enter');
  await expect(report).toContainText('Kubelet sync: environment unchanged', { timeout: 5000 });
  await expect(roll(figure)).toBeEnabled();
  const log = await page.evaluate(() => document.documentElement.dataset.commits ?? '');
  const seen = log.split('\n');
  const progress = seen.indexOf('Kubelet sync in progress|held');
  const result = seen.indexOf('Kubelet sync: environment unchanged|free');
  expect(progress).toBeGreaterThanOrEqual(0);
  expect(result).toBeGreaterThan(progress);
});

test('the tag overlay has no overlapping labels and no label outside the stage, desktop and phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  const width = page.viewportSize()?.width ?? 1440;
  function measureTags(root: Element) {
    const stage = root.querySelector('.cs-stage')?.getBoundingClientRect();
    if (!stage) return { visible: -1, outside: ['no stage'], pairs: [] as string[] };
    const tags = [...root.querySelectorAll<HTMLElement>('.cs-tag')]
      .map((el) => ({ id: el.dataset.object ?? '', r: el.getBoundingClientRect() }))
      .filter((tag) => tag.r.width > 0);
    const outside = tags.filter(({ r }) => r.left < stage.left - 0.5 || r.right > stage.right + 0.5 || r.top < stage.top - 0.5 || r.bottom > stage.bottom + 0.5).map((tag) => tag.id);
    const pairs: string[] = [];
    tags.forEach((a, i) => tags.slice(i + 1).forEach((b) => {
      if (a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom) pairs.push(`${a.id}/${b.id}`);
    }));
    return { visible: tags.length, outside, pairs };
  }
  const initial = await figure.evaluate(measureTags);
  expect(initial.pairs).toEqual([]);
  expect(initial.outside).toEqual([]);
  if (width <= 720) {
    expect(initial.visible).toBe(0);
    await expect(figure.locator('.cs-identity')).toBeVisible();
  } else {
    expect(initial.visible).toBe(7);
  }
  await roll(figure).click();
  await figure.getByRole('checkbox', { name: /Reference a key the object does not hold/ }).check();
  await roll(figure).click();
  const blocked = await figure.evaluate(measureTags);
  expect(blocked.pairs).toEqual([]);
  expect(blocked.outside).toEqual([]);
  if (width > 720) expect(blocked.visible).toBe(8);
});

test('on a phone the ChangeReport stays on screen after a staging toggle and after a rollout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  test.skip((page.viewportSize()?.width ?? 1440) > 480, 'phone-only reach check');
  const figure = await open(page, 'config-secrets');
  const title = figure.locator('.anatomy-change-title');
  await figure.getByRole('radio', { name: 'Mounted volume', exact: true }).check();
  await expect(title).toContainText('Staged template changed; running Pod unchanged');
  // The report sits directly above the staged group: its last row (Not yet) must be on screen under the sticky header.
  const notYet = await page.evaluate(() => {
    const rows = document.querySelectorAll('.cs-change dd');
    const box = rows[rows.length - 1]?.getBoundingClientRect();
    return box ? { top: box.top, bottom: box.bottom } : { top: -1, bottom: Infinity };
  });
  expect(notYet.top).toBeGreaterThanOrEqual(60);
  expect(notYet.bottom).toBeLessThan(760);
  await roll(figure).click();
  await expect(title).toContainText('running; fixture retires');
  const afterRollout = await page.evaluate(() => document.querySelector('.cs-change')?.getBoundingClientRect().top ?? Infinity);
  expect(afterRollout).toBeGreaterThanOrEqual(0);
  expect(afterRollout).toBeLessThan(700);
});

test('the figure, its controls and its result fit a phone viewport without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'config-secrets');
  await figure.getByRole('button', { name: 'Update ConfigMap value to debug', exact: true }).click();
  await expect(figure.locator('.anatomy-change')).toContainText('Stored value changed from info to debug.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
