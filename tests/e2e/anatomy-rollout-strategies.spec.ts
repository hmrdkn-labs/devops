import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const trafficValues = (figure: Locator) => figure.locator('.release-traffic dd').allTextContents();
const statusBadge = (figure: Locator) => figure.locator('.release-status .anatomy-badge').first();
const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
};

test('a stalled rollout waits, reports the deadline, and undo keeps the surviving old Pods', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'rollout-strategies');
  await figure.getByRole('combobox', { name: 'New app:v2 build', exact: true }).selectOption('notReady');
  await figure.getByRole('button', { name: 'Update template to app:v2', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pod template changed to app:v2');
  await expect(figure.locator('.anatomy-manifest mark')).toContainText('registry.example.com/app:v2');

  const step = figure.getByRole('button', { name: 'Step controllers', exact: true });
  await step.click();
  await expect(changeTitle(figure)).toHaveText('RS-v2 creates p4');
  await step.click();
  await expect(changeTitle(figure)).toHaveText(/^Waiting: p4 Not Ready$/);
  await expect(figure.locator('.anatomy-manifest mark')).toContainText('maxUnavailable');
  await expect(trafficValues(figure)).resolves.toEqual(['app=web', '3', '0%', '0%']);

  const deadline = figure.getByRole('button', { name: 'Let progress deadline pass (600 s)', exact: true });
  await expect(deadline).toBeEnabled();
  await deadline.click();
  await expect(changeTitle(figure)).toHaveText('progressDeadlineSeconds (600 s) exceeded');
  await expect(statusBadge(figure)).toContainText('ProgressDeadlineExceeded');
  await expect(figure.locator('.anatomy-change')).toContainText('Kubernetes takes no action');

  await figure.getByRole('button', { name: 'Undo rollout', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('kubectl rollout undo: template back to app:v1');
  await expect(figure.locator('.release-history')).toContainText('revision 3 = RS-v1');
  await expect(figure.locator('.release-ledger li strong')).toHaveText(['p1', 'p2', 'p3', 'p4']);

  await step.click();
  await expect(changeTitle(figure)).toHaveText('RS-v2 deletes p4');
  await expect(figure.locator('.release-ledger li strong')).toHaveText(['p1', 'p2', 'p3']);
  await expect(figure.locator('.release-retired')).toContainText('p4');
  await expect(statusBadge(figure)).toContainText('Complete');
});

test('blue-green traffic follows the Service selector, not the Deployment that is Ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'rollout-strategies');
  await figure.getByRole('combobox', { name: 'Release strategy', exact: true }).selectOption('blueGreen');
  await expect(changeTitle(figure)).toHaveText('Strategy: Blue-green (Service switch)');
  const switchGreen = figure.getByRole('button', { name: 'Switch Service to green', exact: true });
  await expect(switchGreen).toBeDisabled();

  await figure.getByRole('combobox', { name: 'New app:v2 build', exact: true }).selectOption('silentErrors');
  await figure.getByRole('button', { name: 'Deploy green (3 replicas)', exact: true }).click();
  const step = figure.getByRole('button', { name: 'Step controllers', exact: true });
  for (let i = 0; i < 6; i++) await step.click();
  await expect(figure.locator('.release-bed').nth(1).locator('.release-counts dd').nth(2)).toHaveText('3');
  await expect(trafficValues(figure)).resolves.toEqual(['app=web, version=blue', '3', '0%', '0%']);

  await switchGreen.click();
  await expect(changeTitle(figure)).toHaveText('Service selector: version=blue → green');
  await expect(trafficValues(figure)).resolves.toEqual(['app=web, version=green', '3', '100%', '100%']);
  await expect(figure.locator('.anatomy-change')).toContainText('Blue still has its Pods');

  await figure.getByRole('button', { name: 'Switch Service to blue', exact: true }).click();
  await expect(trafficValues(figure)).resolves.toEqual(['app=web, version=blue', '3', '0%', '0%']);
  await expect(figure.locator('.release-ledger li strong')).toHaveText(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
});

test('canary share follows Ready Pod counts, and a canary Pod that is not Ready gets no requests', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'rollout-strategies');
  await figure.getByRole('combobox', { name: 'Release strategy', exact: true }).selectOption('canary');
  await figure.getByRole('combobox', { name: 'Canary replicas (stable stays 3)', exact: true }).selectOption('1');
  await expect(changeTitle(figure)).toHaveText('Canary replicas 0 → 1');
  await expect(figure.locator('.anatomy-manifest mark')).toContainText('replicas: 1');

  const step = figure.getByRole('button', { name: 'Step controllers', exact: true });
  await step.click();
  await expect(changeTitle(figure)).toHaveText('Deployment web-canary creates p4');
  await expect(trafficValues(figure)).resolves.toEqual(['app=web', '3', '0%', '0%']);
  await step.click();
  await expect(changeTitle(figure)).toHaveText('p4 became Ready');
  await expect(trafficValues(figure)).resolves.toEqual(['app=web', '4', '25%', '0%']);
});

test('keyboard activates the template change and motion settles to re-enable the next step', async ({ page }) => {
  const figure = await open(page, 'rollout-strategies');
  const update = figure.getByRole('button', { name: 'Update template to app:v2', exact: true });
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('Pod template changed to app:v2');
  const step = figure.getByRole('button', { name: 'Step controllers', exact: true });
  await expect(step).toBeEnabled({ timeout: 5000 });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('RS-v2 creates p4');
});

test('390x844: after a control press the controls, ChangeReport and status read together, and the beds follow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'rollout-strategies');
  const controls = figure.locator('.anatomy-controls');
  await figure.getByRole('button', { name: 'Update template to app:v2', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pod template changed to app:v2');

  const controlsBox = await boxOf(controls);
  const changeBox = await boxOf(figure.locator('.anatomy-change'));
  const statusBox = await boxOf(figure.locator('.release-status'));
  const bedsBox = await boxOf(figure.locator('.release-beds'));
  expect(changeBox.y - (controlsBox.y + controlsBox.height)).toBeGreaterThanOrEqual(0);
  expect(changeBox.y - (controlsBox.y + controlsBox.height)).toBeLessThan(40);
  expect(statusBox.y).toBeGreaterThanOrEqual(changeBox.y + changeBox.height);
  expect(bedsBox.y).toBeGreaterThan(statusBox.y + statusBox.height);

  // Scroll the controls to the top of the screen: the who row and the status must still be on this 844px screen.
  await controls.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const who = await boxOf(figure.locator('.anatomy-change dd').nth(1));
  const badge = await boxOf(figure.locator('.release-status'));
  expect(who.y + who.height).toBeLessThanOrEqual(844);
  // The app's fixed bottom navigation covers about 80px of the viewport, so the real budget ends at 844 - 80.
  expect(badge.y + badge.height).toBeLessThanOrEqual(844 - 80);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
