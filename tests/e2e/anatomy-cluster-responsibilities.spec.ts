import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const field = (figure: Locator, label: string) =>
  figure.locator(`xpath=.//section[contains(@class,"anatomy-change")]//dt[normalize-space()="${label}"]/following-sibling::dd`);
const objectRow = (figure: Locator, id: string) => figure.locator(`.cc-objects li[data-object="${id}"]`);
const owner = (figure: Locator, id: string) => figure.locator(`.cc-owners li[data-witness="${id}"]`);

test('keyboard walk: each checkpoint names its actor, shifts only that owner’s latch, and reports what has not happened', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(field(figure, 'Who')).toContainText('API server');
  await expect(field(figure, 'Not yet')).toContainText('not stored');
  await next.press('Enter');
  await next.press('Enter');
  await expect(field(figure, 'Who')).toContainText('Deployment controller');
  await expect(owner(figure, 'deployment')).toHaveAttribute('data-state', 'acting');
  await expect(owner(figure, 'replicaset')).toHaveAttribute('data-state', 'not-yet');
  await expect(objectRow(figure, 'pod')).toContainText('not created');
  await next.press('Enter');
  await expect(field(figure, 'Who')).toContainText('ReplicaSet controller');
  await expect(field(figure, 'Changed')).toContainText('demo-7c5d9f8b6d-q8k2m');
  await expect(owner(figure, 'deployment')).toHaveAttribute('data-state', 'acted');
  await expect(owner(figure, 'replicaset')).toHaveAttribute('data-state', 'acting');
  await expect(objectRow(figure, 'pod')).toContainText('created');
  await expect(objectRow(figure, 'nodeName')).toContainText('unset');
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'name: demo-7c5d9f8b6d-q8k2m' })).toHaveCount(1);
  await next.press('Enter');
  await expect(field(figure, 'Who')).toContainText('kube-scheduler');
  await expect(objectRow(figure, 'nodeName')).toContainText('node-a');
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'nodeName: node-a' })).toHaveCount(1);
  await expect(owner(figure, 'runtime')).toContainText('containers started: 0');
  await next.press('Enter');
  await next.press('Enter');
  await expect(objectRow(figure, 'phase')).toContainText('Running · not Ready');
  await expect(owner(figure, 'runtime')).toContainText('containers started: 1');
  await expect(next).toBeDisabled();
});

test('reset returns to draft with a report that states nothing was changed in any cluster', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(objectRow(figure, 'replicaSet')).toContainText('created');
  await figure.getByRole('button', { name: 'Reset to draft', exact: true }).click();
  await expect(objectRow(figure, 'replicaSet')).toContainText('not created');
  await expect(objectRow(figure, 'pod')).toContainText('not created');
  await expect(field(figure, 'Who')).toContainText('You, the learner');
  await expect(field(figure, 'Not yet')).toContainText('No cluster was contacted');
});

test('inspection changes the view but never the checkpoint actor or any object', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  for (let i = 0; i < 4; i++) await next.click();
  await figure.getByLabel('Inspect actor').selectOption({ label: 'etcd' });
  await figure.getByRole('button', { name: 'Open inspection drawer', exact: true }).click();
  await expect(figure.getByRole('button', { name: 'Close inspection drawer', exact: true })).toBeEnabled();
  await expect(figure.locator('.cc-now')).toContainText('ReplicaSet controller');
  await expect(figure.locator('.cc-now')).toContainText('Inspected actor: etcd');
  await expect(figure.locator('.cc-assembly[data-assembly="controllers"]')).toHaveAttribute('data-acting', 'true');
  await expect(figure.locator('.cc-assembly[data-assembly="store"]')).toHaveAttribute('data-inspected', 'true');
  await expect(figure.locator('.cc-assembly[data-assembly="store"]')).toHaveAttribute('data-acting', 'false');
  await expect(field(figure, 'Who')).toContainText('You, the learner');
  await expect(objectRow(figure, 'pod')).toContainText('created');
  await expect(owner(figure, 'replicaset')).toContainText('Pods created: 1');
});

test('inspection drawer moves by keyboard and the checkpoint stays put', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, 'cluster-responsibilities');
  const drawer = figure.locator('.cc-assembly[data-assembly="api"]');
  const before = await drawer.boundingBox();
  const inspect = figure.getByRole('button', { name: 'Open inspection drawer', exact: true });
  await inspect.focus();
  await inspect.press('Enter');
  await expect(figure.getByRole('button', { name: 'Close inspection drawer', exact: true })).toBeEnabled();
  await expect.poll(async () => (await drawer.boundingBox())!.y).not.toBe(before!.y);
  await expect(figure.locator('.cc-now')).toContainText('Settled checkpoint 0 of 7');
});

test('motion is learner-paced: a step settles, then waits for the next press', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  await next.click();
  await expect(figure.locator('.anatomy-change')).toHaveAttribute('aria-busy', 'false');
  await expect(figure.locator('.cc-now')).toContainText('Settled checkpoint 1 of 7');
  await expect(next).toBeEnabled();
  await page.waitForTimeout(1200);
  await expect(figure.locator('.cc-now')).toContainText('Settled checkpoint 1 of 7');
});

test('phones keep controls, report and object status without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const figure = await open(page, 'cluster-responsibilities');
  await figure.getByRole('button', { name: 'Next checkpoint', exact: true }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(figure.locator('.anatomy-change')).toBeVisible();
  await expect(figure.locator('.cc-objects')).toBeVisible();
});
