import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('an HPA sync writes spec.replicas, and no Pod exists until controllers act', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  const report = figure.locator('.anatomy-change');
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('400');
  await expect(report).toContainText('spec.replicas stays 2');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).click();
  await expect(report).toContainText('Scaled up 2 → 4');
  await expect(report).toContainText('No Pod is created yet');
  await expect(figure.locator('.as-ledger')).not.toContainText('web-3');
  await figure.getByRole('button', { name: 'Run controllers to quiet' }).click();
  await expect(report).toContainText('Controllers are quiet');
  await expect(figure.locator('.as-ledger')).toContainText('web-4');
});

test('Pending Pods wait for a node, and Cluster Autoscaler, not the HPA, adds it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  const report = figure.locator('.anatomy-change');
  const ledger = figure.locator('.as-ledger');
  const autoscaler = figure.getByRole('checkbox', { name: 'Cluster Autoscaler may add nodes' });
  await figure.getByRole('combobox', { name: 'Container CPU request' }).selectOption('500');
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('1000');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).click();
  await expect(report).toContainText('Scaled up 2 → 4');
  await autoscaler.uncheck();
  await figure.getByRole('button', { name: 'Run controllers to quiet' }).click();
  await expect(report).toContainText('ReplicaSet created web-3, web-4');
  await expect(report).toContainText('web-3, web-4 still Pending');
  await expect(ledger).toContainText('unassigned · Pending');
  await expect(ledger).toContainText('not provisioned');
  await autoscaler.check();
  await figure.getByRole('button', { name: 'Run controllers to quiet' }).click();
  await expect(report).toContainText('Cluster Autoscaler provisioned node-3');
  await expect(report).toContainText('kube-scheduler bound web-3, web-4 to node-3');
  await expect(report).toContainText('kubelet marked web-3, web-4 Ready');
  await expect(ledger).toContainText('2 web Pods · room for 0 more');
  await expect(ledger).toContainText('Ready');
});

test('with no CPU request the HPA reports no CPU decision and leaves replicas alone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  await figure.getByRole('combobox', { name: 'Container CPU request' }).selectOption('none');
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('1000');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).click();
  await expect(figure.locator('.anatomy-change')).toContainText('No CPU decision');
  await expect(figure.locator('.anatomy-readout')).toContainText('no CPU target');
  await expect(figure.locator('.as-ledger')).toContainText('spec.replicas 2');
});

test('maxReplicas clamps the recommendation and the report shows the raw value', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  await figure.getByRole('combobox', { name: 'HPA maxReplicas' }).selectOption('3');
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('1000');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).click();
  await expect(figure.locator('.anatomy-change')).toContainText('clamped to maxReplicas 3');
  await expect(figure.locator('.anatomy-change')).toContainText('Scaled up 2 → 3');
  const highlighted = figure.locator('.anatomy-manifest mark').filter({ hasText: 'maxReplicas: 3' });
  await expect(highlighted).toHaveCount(1);
});

test('selects show the model state on first paint and after Reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  const shown = (name: string) => figure.getByRole('combobox', { name }).locator('option:checked');
  await expect(shown('Load on web Pods (total CPU)')).toHaveText('250m total');
  await expect(shown('Container CPU request')).toHaveText('250m request');
  await expect(shown('HPA maxReplicas')).toHaveText('max 6');
  await expect(shown('Scale-down stabilization window')).toHaveText('45 s (3 syncs)');
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('800');
  await figure.getByRole('combobox', { name: 'HPA maxReplicas' }).selectOption('3');
  await figure.getByRole('button', { name: 'Reset' }).click();
  await expect(shown('Load on web Pods (total CPU)')).toHaveText('250m total');
  await expect(shown('HPA maxReplicas')).toHaveText('max 6');
});

test('the Cluster Autoscaler checkbox and its label share one row', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  const box = await figure.getByRole('checkbox', { name: 'Cluster Autoscaler may add nodes' }).boundingBox();
  const text = await figure.getByText('Cluster Autoscaler may add nodes', { exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(text).not.toBeNull();
  expect(Math.abs((box!.y + box!.height / 2) - (text!.y + text!.height / 2))).toBeLessThan(8);
});

test('controls re-enable after the motion settles, with normal motion', async ({ page }) => {
  const figure = await open(page, 'autoscaling');
  const step = figure.getByRole('button', { name: 'Next controller step' });
  await figure.getByRole('combobox', { name: 'Load on web Pods (total CPU)' }).selectOption('400');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).click();
  await expect(step).toBeEnabled({ timeout: 5000 });
  await step.click();
  await expect(figure.locator('.anatomy-change')).toContainText('web-3 created');
  await expect(figure.getByRole('button', { name: 'Run one HPA sync (15 s)' })).toBeEnabled({ timeout: 5000 });
});

test('controls are keyboard reachable and the phone layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'autoscaling');
  await figure.getByRole('button', { name: 'Run one HPA sync (15 s)' }).focus();
  await page.keyboard.press('Enter');
  await expect(figure.locator('.anatomy-change')).toContainText('No change at 2');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
