import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const card = (figure: Locator, node: string) => figure.locator(`.capacity-node[data-node="${node}"]`);

test('each stage commits one change, its owner, and what has not happened yet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'scheduling-placement');
  const report = figure.getByRole('status');
  const manifest = figure.locator('.anatomy-manifest');
  const highlighted = (text: string) => manifest.locator('mark', { hasText: text });
  const readout = figure.locator('.anatomy-readout');
  const cpu = figure.getByRole('combobox', { name: 'CPU request', exact: true });
  const filter = figure.getByRole('button', { name: '1 · Filter budgets', exact: true });
  const score = figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true });
  const assign = figure.getByRole('button', { name: '3 · Record assignment', exact: true });
  const execute = figure.getByRole('button', { name: '4 · Simulate node execution', exact: true });

  // Before the filter commits: no dock is filtered and no score number exists anywhere.
  await expect(card(figure, 'node-c')).toContainText('not filtered');
  await expect(card(figure, 'node-c').locator('.capacity-score')).not.toContainText(/\d/);

  await filter.click();
  await expect(report).toHaveAttribute('aria-busy', 'false');
  await expect(report.locator('dt', { hasText: 'Not yet' })).toBeVisible();
  // Eligible is not scored: the number waits for the Score control.
  await expect(card(figure, 'node-c')).toContainText('eligible · awaiting scoring');
  await expect(card(figure, 'node-c').locator('.capacity-score')).not.toContainText(/\d/);
  // Each resource gets its own status with its shortfall.
  await expect(card(figure, 'node-a').locator('[data-resource="cpu"]')).toContainText('short by 300m');
  await expect(card(figure, 'node-b').locator('[data-resource="memory"]')).toContainText('short by 512Mi');

  await score.click();
  await expect(report).toHaveAttribute('aria-busy', 'false');
  await expect(card(figure, 'node-c').locator('.capacity-score')).toHaveText('Score 22.50');
  await expect(card(figure, 'node-c')).toContainText('selected · not assigned');
  await expect(card(figure, 'node-a').locator('.capacity-score')).not.toContainText(/\d/);
  await expect(highlighted('cpu: 600m')).toHaveCount(1);
  await expect(manifest).toContainText('nodeName: ""');

  await assign.click();
  await expect(report).toHaveAttribute('aria-busy', 'false');
  await expect(highlighted('nodeName: node-c')).toHaveCount(1);
  await expect(card(figure, 'node-c')).toContainText('assigned · containers not started');
  await expect(readout).toContainText('phase Pending');

  await execute.click();
  await expect(report).toHaveAttribute('aria-busy', 'false');
  await expect(highlighted('phase: Running')).toHaveCount(1);
  await expect(card(figure, 'node-c')).toContainText('running (fixture step)');
  await expect(report.locator('dt', { hasText: 'Not yet' })).toBeVisible();

  // Editing an input starts a fresh unassigned Pod; the previous placement is discarded.
  await cpu.selectOption('1500');
  await expect(report).toHaveAttribute('aria-busy', 'false');
  await expect(card(figure, 'node-c')).toContainText('not filtered');
  await expect(manifest).toContainText('nodeName: ""');

  await filter.click();
  await expect(score).toBeDisabled();
  await expect(card(figure, 'node-a')).toContainText('rejected');
  await expect(manifest).toContainText('reason: Unschedulable');

  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(cpu).toHaveValue('600');
  await expect(card(figure, 'node-c')).toContainText('not filtered');
});

test('keyboard commits a stage and returns focus to the control that now carries the next stage', async ({ page }) => {
  const figure = await open(page, 'scheduling-placement');
  const filter = figure.getByRole('button', { name: '1 · Filter budgets', exact: true });
  const score = figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true });
  await filter.focus();
  await page.keyboard.press('Enter');
  await expect(score).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card(figure, 'node-c').locator('.capacity-score')).toHaveText('Score 22.50');
  await expect(figure.getByRole('button', { name: '3 · Record assignment', exact: true })).toBeFocused();
});

test('at 390px the controls, ChangeReport, and node status fit without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const figure = await open(page, 'scheduling-placement');
  await figure.getByRole('button', { name: '1 · Filter budgets', exact: true }).click();
  await expect(figure.getByRole('status')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await figure.locator('.capacity-node').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
});
