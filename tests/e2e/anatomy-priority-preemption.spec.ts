import { test, expect, type Locator, type Page } from '@playwright/test';
import { open } from './anatomy/helpers';

const slug = 'priority-preemption';
const runButton = (figure: Locator) => figure.getByRole('button', { name: 'Run scheduling pass', exact: true });
const endGraceButton = (figure: Locator) => figure.getByRole('button', { name: 'End grace period', exact: true });
const report = (figure: Locator) => figure.locator('.anatomy-change');
const reportField = (page: Page, figure: Locator, label: string) =>
  report(figure).locator('div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
const selectClass = (figure: Locator, value: string) => figure.locator('.pp-config select').first().selectOption(value);
const batchBudget = (figure: Locator) => figure.getByRole('checkbox', { name: 'PodDisruptionBudget: batch-2 allows no disruption', exact: true });
const reportsBudget = (figure: Locator) => figure.getByRole('checkbox', { name: 'PodDisruptionBudget: reports-1 allows no disruption', exact: true });
const rivalToggle = (figure: Locator) => figure.getByRole('checkbox', { name: 'incident-high (1000000) arrives when the grace period ends', exact: true });

test('nothing is attempted before Run; the first pass nominates node-a and names the victim, the actor and what is not yet done', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await expect(figure.locator('.pp-card[data-object="api-pod"]')).toContainText('queued · not attempted');
  await expect(figure.locator('.pp-card[data-object="api-pod"]')).not.toContainText('nominated');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-a; batch-2 terminating');
  await expect(reportField(page, figure, 'Changed')).toContainText('status.nominatedNodeName is node-a');
  await expect(reportField(page, figure, 'Changed')).toContainText('DisruptionTarget');
  await expect(reportField(page, figure, 'Who')).toContainText('kube-scheduler');
  await expect(reportField(page, figure, 'Not yet')).toContainText('api-pod is not bound');
  await expect(figure.locator('.pp-card[data-object="api-pod"]')).toContainText('nominated to node-a · not bound');
  await expect(figure.locator('.pp-ledger tr[data-pod="api-pod"]')).toContainText('unset');
});

test('End grace period binds the nominated Pod, and the report says it is assigned but not Running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(endGraceButton(figure)).toBeEnabled();
  await endGraceButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod assigned to node-a · not Running');
  await expect(reportField(page, figure, 'Not yet')).toContainText('Not Running');
  await expect(figure.locator('.pp-ledger tr[data-pod="batch-2"]')).toContainText('Gone');
  await expect(figure.locator('.anatomy-manifest').nth(1)).toContainText('phase: Pending');
});

test('a batch-2 budget moves the preemption to node-b, which evicts a higher-priority victim', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await batchBudget(figure).check();
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-b; reports-1 terminating');
  await expect(reportField(page, figure, 'Why')).toContainText('PDB violations 0');
});

test('with both budgets every candidate violates one, so preemption still happens (best-effort)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await batchBudget(figure).check();
  await reportsBudget(figure).check();
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-a; batch-2 terminating');
  await expect(reportField(page, figure, 'Not yet')).toContainText('batch-2');
});

test('preemptionPolicy Never keeps the Pod queued first, with no victim and no nomination', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectClass(figure, 'platform-critical-nonpreempting');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod stays Pending · non-preempting');
  await expect(reportField(page, figure, 'Why')).toContainText('Never forbids preemption');
  await expect(endGraceButton(figure)).toBeDisabled();
  await expect(figure.locator('.anatomy-manifest').first().locator('mark')).toContainText('preemptionPolicy: Never');
});

test('a rival of higher priority takes node-a when the grace period ends, and the preemptor is re-nominated', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await rivalToggle(figure).check();
  await runButton(figure).click();
  await endGraceButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('incident-high took node-a; api-pod re-nominated to node-b');
  await expect(reportField(page, figure, 'Why')).toContainText('clears that nomination');
  await expect(figure.locator('.pp-ledger tr[data-pod="incident-high"]')).toContainText('Assigned');
  await endGraceButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod assigned to node-b · not Running');
});

test('a Pod with no priority class waits behind nothing and preempts nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await selectClass(figure, 'none');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod stays Pending');
  await expect(endGraceButton(figure)).toBeDisabled();
});

test('a batch-scheduler Pod is left to its own scheduler, and default-scheduler nominates nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await figure.locator('.pp-config select').nth(1).selectOption('batch-scheduler');
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod is not handled by default-scheduler');
  await expect(endGraceButton(figure)).toBeDisabled();
});

test('Run is reachable and operable from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await runButton(figure).focus();
  await page.keyboard.press('Enter');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-a');
});

test('the blocks settle to the same result with motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, slug);
  await runButton(figure).click();
  await expect(runButton(figure)).toBeDisabled();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-a', { timeout: 15000 });
  await expect(runButton(figure)).toBeDisabled();
  await expect(endGraceButton(figure)).toBeEnabled();
});

test('controls stay inert until hydration, while the object and explanation stay readable', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/(\/_astro\/Figure\.[^/]+\.js|\/anatomy\/priority-preemption\/Figure(\.tsx)?)(\?.*)?$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto(`/anatomy/${slug}/`, { waitUntil: 'commit' });
  const figure = page.locator('.pp-figure');
  try {
    await expect.poll(() => held).toBe(true);
    await expect(figure).toHaveAttribute('aria-busy', 'true');
    await expect(figure.getByRole('img')).toBeVisible();
    const run = runButton(figure);
    await expect(run).toBeDisabled();
    await run.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(figure.locator('.pp-card[data-object="api-pod"]')).not.toContainText('nominated');
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
  await runButton(figure).click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('api-pod nominated to node-a');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const width = page.viewportSize()!.width;
  for (const locator of [runButton(figure), report(figure), figure.locator('.pp-card[data-object="node-a"]'), figure.locator('.pp-card[data-object="api-pod"]')]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
});
