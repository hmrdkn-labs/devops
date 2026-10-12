import { test, expect, type Locator, type Page } from '@playwright/test';
import { open } from './anatomy/helpers';

const slug = 'taints-tolerations';
const runButton = (figure: Locator) => figure.getByRole('button', { name: /^(Run|Replay) placement$/ });
const report = (figure: Locator) => figure.locator('.anatomy-change');
const reportField = (page: Page, figure: Locator, label: string) =>
  report(figure).locator('div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
const selectProfile = (figure: Locator, value: string) => figure.locator('.anatomy-controls select').selectOption(value);
const cpuToggle = (figure: Locator) => figure.getByRole('checkbox', { name: 'node-a: enough free CPU (800m, not 400m)', exact: true });
const nodeBToggle = (figure: Locator) => figure.getByRole('checkbox', { name: 'node-b present (untainted, 1000m free)', exact: true });

test('no verdict is shown before Run placement, and the first run names the outcome, the actor and what is not yet done', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await expect(figure.locator('.tt-badges').first()).toContainText('not run');
  await expect(figure.locator('.tt-cards')).not.toContainText(/permits|rejects|placed here|unscheduled|assigned to/);
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('report-batch-1 unscheduled');
  await expect(reportField(page, figure, 'Changed')).toContainText('taint rejects');
  await expect(reportField(page, figure, 'Who')).toContainText('kube-scheduler');
  await expect(reportField(page, figure, 'Why')).toContainText('no toleration');
  await expect(reportField(page, figure, 'Not yet')).toContainText('no container runs');
  await expect(figure.locator('.tt-card[data-object="pod"]')).toContainText('unscheduled · Pending');
});

test('an Equal toleration binds node-a, and the report says assignment is not Running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'equal');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('assigned to node-a');
  await expect(reportField(page, figure, 'Not yet')).toContainText('Assigned is not Running');
  await expect(figure.locator('.tt-match tbody tr').first()).toContainText('match');
  await expect(figure.locator('.tt-card[data-object="node-a"]')).toContainText('placed here');
  await expect(figure.locator('.tt-card[data-object="pod"]')).toContainText('assigned to node-a · not Running');
});

test('a wrong effect names the mismatched field and highlights that manifest line', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'wrong-effect');
  await runButton(figure).click();
  await expect(reportField(page, figure, 'Why')).toContainText('effect: Pod tolerates NoExecute, node-a taint is NoSchedule');
  await expect(figure.locator('.tt-match')).toContainText('mismatch');
  const podPanel = figure.locator('.anatomy-manifest').nth(1);
  await expect(podPanel.locator('mark')).toContainText('effect: NoExecute');
  await expect(podPanel.locator('mark', { hasText: 'key: dedicated' })).toHaveCount(0);
  await expect(figure.locator('.anatomy-manifest').first().locator('mark')).toContainText('effect: NoSchedule');
  await expect(podPanel).toContainText('differs from node-a taint');
});

test('capacity fails independently of a matching taint', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'equal');
  await cpuToggle(figure).uncheck();
  await runButton(figure).click();
  await expect(figure.locator('.tt-card[data-object="node-a"]')).toContainText('taint permits');
  await expect(figure.locator('.tt-card[data-object="node-a"]')).toContainText('CPU short: 600m > 400m');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('unscheduled');
  await expect(reportField(page, figure, 'Why')).toContainText('CPU short');
});

test('node-b wins the fixed fixture score over an eligible node-a, and the toleration adds nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'equal');
  await nodeBToggle(figure).check();
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('assigned to node-b');
  await expect(reportField(page, figure, 'Why')).toContainText('fixed fixture score');
  await expect(figure.locator('.tt-card[data-object="node-a"]')).toContainText('eligible · lost to node-b');
});

test('a change before any run edits the pending Pod in place; a change after a run creates the next Pod', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  const podStrong = figure.locator('.tt-card[data-object="pod"] strong');
  await selectProfile(figure, 'equal');
  await expect(podStrong).toHaveText('report-batch-1');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('report-batch-1 · toleration changed');
  await selectProfile(figure, 'wrong-value');
  await expect(podStrong).toHaveText('report-batch-1');
  await selectProfile(figure, 'equal');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('report-batch-1 assigned to node-a');
  await selectProfile(figure, 'wrong-key');
  await expect(podStrong).toHaveText('report-batch-2');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('report-batch-2 · toleration changed');
  await expect(reportField(page, figure, 'Not yet')).toContainText('No filter has run');
  await expect(figure.locator('.tt-badges').first()).toContainText('not run');
});

test('Run placement is reachable and operable from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'equal');
  await runButton(figure).focus();
  await page.keyboard.press('Enter');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('assigned to node-a');
  await expect(runButton(figure)).toHaveText('Replay placement');
});

test('the cartridge settles to the same result with motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'wrong-value');
  await runButton(figure).click();
  await expect(runButton(figure)).toBeDisabled();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('unscheduled', { timeout: 15000 });
  await expect(runButton(figure)).toBeEnabled();
});

test('controls stay inert until hydration, while the object and explanation stay readable', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/(\/_astro\/Figure\.[^/]+\.js|\/anatomy\/taints-tolerations\/Figure(\.tsx)?)(\?.*)?$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto(`/anatomy/${slug}/`, { waitUntil: 'commit' });
  const figure = page.locator('.tt-figure');
  try {
    await expect.poll(() => held).toBe(true);
    await expect(figure).toHaveAttribute('aria-busy', 'true');
    await expect(figure.getByRole('img')).toBeVisible();
    const run = runButton(figure);
    await expect(run).toBeDisabled();
    await run.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(figure.locator('.tt-badges').first()).toContainText('not run');
    const object = await figure.boundingBox();
    const explanation = await page.locator('.anatomy-explanation').boundingBox();
    expect(object).not.toBeNull();
    expect(explanation).not.toBeNull();
    expect(explanation!.y).toBeGreaterThanOrEqual(object!.y + object!.height);
  } finally { release(); }
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(runButton(figure)).toBeEnabled();
});

test('on a 390px phone the controls, report and object status sit together without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectProfile(figure, 'equal');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('assigned to node-a');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const width = page.viewportSize()!.width;
  for (const locator of [runButton(figure), report(figure), figure.locator('.tt-card[data-object="node-a"]'), figure.locator('.tt-card[data-object="pod"]')]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
});
