import { test, expect, type Locator, type Page } from '@playwright/test';
import { open } from './anatomy/helpers';

const slug = 'topology-spread';
const runButton = (figure: Locator) => figure.getByRole('button', { name: 'Run placement', exact: true });
const report = (figure: Locator) => figure.locator('.anatomy-change');
const reportTitle = (figure: Locator) => report(figure).locator('.anatomy-change-title');
const reportField = (page: Page, figure: Locator, label: string) =>
  report(figure).locator('div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
const selectOption = (figure: Locator, label: string, value: string) => figure.getByLabel(label).selectOption(value);
const minDomainsToggle = (figure: Locator) => figure.getByRole('checkbox', { name: /minDomains/ });
const podManifest = (figure: Locator) => figure.locator('.anatomy-manifest').nth(1);

test('no verdict is shown before Run placement; the first run names the outcome, the actor and what has not happened', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await expect(figure.locator('.spread-cards')).toContainText('not run');
  await expect(figure.locator('.spread-cards')).not.toContainText(/rejected|selected|passes/);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
  await expect(reportField(page, figure, 'Changed')).toContainText('spec.nodeName set to node-b1');
  await expect(reportField(page, figure, 'Who')).toContainText('PodTopologySpread filter');
  await expect(reportField(page, figure, 'Why')).toContainText('zone-a: 2 matching + web-4 = 3, minus global minimum 1 = skew 2 > maxSkew 1');
  await expect(reportField(page, figure, 'Not yet')).toContainText('Assigned is not Running');
  await expect(figure.locator('.spread-cards')).toContainText('rejected: over maxSkew');
});

test('after a bind the table keeps one time base and the manifest shows the bound Pod with spec.nodeName', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
  await expect(figure.locator('.spread-min')).toContainText('Global minimum used at run time: 1');
  const zoneB = figure.locator('.spread-table tr', { hasText: 'node-b1' });
  await expect(zoneB.locator('td[data-label="Before this run: matching in domain"]')).toHaveText('1');
  await expect(zoneB.locator('td[data-label="+ this Pod"]')).toHaveText('1');
  await expect(zoneB.locator('td[data-label="= skew"]')).toHaveText('1');
  await expect(podManifest(figure)).toContainText('nodeName: node-b1');
  await expect(podManifest(figure)).not.toContainText('next Pod created from this template');
});

test('maxSkew 2 admits the more loaded zone, and the first passing name wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectOption(figure, 'maxSkew', '2');
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-a1');
});

test('ScheduleAnyway rejects no candidate and leaves the choice to the score', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectOption(figure, 'whenUnsatisfiable', 'ScheduleAnyway');
  await expect(minDomainsToggle(figure)).toBeDisabled();
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
  await expect(reportField(page, figure, 'Who')).toContainText('PodTopologySpread score');
  await expect(reportField(page, figure, 'Why')).toContainText('rejects nothing');
  await expect(figure.locator('.spread-table')).not.toContainText('rejected');
});

test('minDomains above the number of zones leaves the Pod Pending, and the report names the zero minimum', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await minDomainsToggle(figure).check();
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 unscheduled · Pending');
  await expect(reportField(page, figure, 'Why')).toContainText('global minimum is 0');
  await expect(figure.locator('.spread-status')).toContainText('unscheduled · Pending');
});

test('removing the newest Pod leaves the skew above maxSkew, and only the next placement corrects it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await figure.getByRole('button', { name: 'Remove newest web Pod', exact: true }).click();
  await expect(reportTitle(figure)).toContainText('web-3 removed from node-b1');
  await expect(reportField(page, figure, 'Not yet')).toContainText('above maxSkew 1');
  await expect(figure.locator('li[data-object="web-1"]')).toContainText('on node-a1');
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
});

test('a Pod created after a placement gets a new identity, and the removed id stays in the ledger', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
  await figure.getByRole('button', { name: 'Scale up: create next web Pod', exact: true }).click();
  await expect(reportTitle(figure)).toContainText('web-5 created');
  await expect(podManifest(figure)).toContainText('name: web-5');
  await figure.getByRole('button', { name: 'Remove newest web Pod', exact: true }).click();
  await expect(figure.locator('li[data-object="web-4"]')).toContainText('removed');
  await expect(figure.locator('li[data-object="web-5"]')).toContainText('no node yet');
});

test('a constraint change before any run edits the pending Pod in place and keeps its name', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectOption(figure, 'topologyKey', 'hostname');
  await expect(reportTitle(figure)).toContainText('web-4 constraint changed · not run');
  await expect(reportField(page, figure, 'Not yet')).toContainText('No filter or score has run');
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-a2');
});

test('Run placement is first in the controls and operable from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  const firstControl = figure.locator('.anatomy-controls').locator('button, select, input').first();
  await expect(firstControl).toHaveText('Run placement');
  await runButton(figure).focus();
  await page.keyboard.press('Enter');
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1');
});

test('the cartridge settles to the same result with motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('web-4 assigned to node-b1', { timeout: 5000 });
  await expect(figure.locator('li[data-object="web-4"]')).toContainText('on node-b1');
});

test('controls stay inert until hydration, while the object and explanation stay readable', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/(\/_astro\/Figure\.[^/]+\.js|\/anatomy\/topology-spread\/Figure(\.tsx)?)(\?.*)?$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto(`/anatomy/${slug}/`, { waitUntil: 'commit' });
  const figure = page.locator('.spread-figure');
  try {
    await expect.poll(() => held).toBe(true);
    await expect(figure).toHaveAttribute('aria-busy', 'true');
    await expect(figure.getByRole('img')).toBeVisible();
    const run = runButton(figure);
    await expect(run).toBeDisabled();
    const before = await reportTitle(figure).textContent();
    await run.evaluate((element) => (element as HTMLButtonElement).click());
    expect(await reportTitle(figure).textContent()).toBe(before);
    const object = await figure.boundingBox();
    const explanation = await page.locator('.anatomy-explanation').boundingBox();
    expect(object).not.toBeNull();
    expect(explanation).not.toBeNull();
    expect(explanation!.y).toBeGreaterThanOrEqual(object!.y + object!.height);
  } finally {
    release();
  }
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(runButton(figure)).toBeEnabled();
});

test('on a 390px phone the controls, report and object status sit together without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('assigned to node-b1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const controls = await figure.locator('.anatomy-controls').boundingBox();
  const change = await report(figure).boundingBox();
  const status = await figure.locator('.spread-status').boundingBox();
  expect(controls).not.toBeNull();
  expect(change).not.toBeNull();
  expect(status).not.toBeNull();
  expect(change!.y).toBeGreaterThanOrEqual(controls!.y);
  expect(status!.y).toBeGreaterThanOrEqual(change!.y);
});

test('on a 390px phone the overlay tags stay out of the way and every result cell fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(reportTitle(figure)).toContainText('assigned to node-b1');
  await expect(figure.locator('.spread-tag.spread-node').first()).toBeHidden();
  await expect(figure.locator('.spread-tag.spread-zone').first()).toBeHidden();
  await expect(figure.locator('.spread-table-scroll')).toBeHidden();
  const results = figure.locator('.spread-compact-row');
  const count = await results.count();
  expect(count).toBe(4);
  for (let index = 0; index < count; index++) {
    const box = await results.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
