import { test, expect, type Locator, type Page } from '@playwright/test';
import { open } from './anatomy/helpers';

const reportOf = (figure: Locator) => figure.locator('.anatomy-change');
const reportField = (figure: Locator, label: string) =>
  reportOf(figure).locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
const nodeCard = (figure: Locator, id: string) => figure.locator(`.affinity-node[data-node="${id}"]`);
const step = (figure: Locator) => figure.getByRole('button', { name: /^(Evaluate node requirements|Score eligible nodes|Record assignment|Simulate container startup|Placement finished)$/ });
const named = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const normalize = (text: string | null) => (text ?? '').split('\n').map((line) => line.trimEnd()).join('\n').trim();

async function openSorter(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return open(page, 'node-affinity');
}

test('a default placement reveals each stage only after its button is pressed, and names who acted and what has not happened', async ({ page }) => {
  const figure = await openSorter(page);
  await expect(reportOf(figure).locator('dt')).toHaveText(['Changed', 'Who', 'Why', 'Not yet']);
  await expect(nodeCard(figure, 'node-b')).toContainText('not scored yet');
  await expect(nodeCard(figure, 'node-b')).toContainText('not evaluated');
  await expect(step(figure)).toHaveText('Evaluate node requirements');

  await step(figure).click();
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('2 node(s) passed the filters');
  await expect(reportField(figure, 'Who')).toContainText('kube-scheduler filter plugins');
  await expect(nodeCard(figure, 'node-c')).toContainText('Rejected');
  await expect(nodeCard(figure, 'node-c')).toContainText('nodeSelector needs disk=ssd, node has disk=hdd');
  await expect(nodeCard(figure, 'node-b')).toContainText('Eligible');
  await expect(nodeCard(figure, 'node-b')).toContainText('not scored yet');
  await expect(step(figure)).toHaveText('Score eligible nodes');

  await step(figure).click();
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('Scored 2 eligible node(s)');
  await expect(nodeCard(figure, 'node-b')).toContainText('matches preferred zone, score 60');
  await expect(nodeCard(figure, 'node-a')).toContainText('eligible, no preference match, score 0');
  await expect(step(figure)).toHaveText('Record assignment');

  await step(figure).click();
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Assigned to node-b');
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Running: no');
  await expect(reportField(figure, 'Not yet')).toContainText('Containers have not started');
  await expect(step(figure)).toHaveText('Simulate container startup');

  await step(figure).click();
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Running: yes');
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('sorter-1 is Running on node-b');
  await expect(step(figure)).toBeDisabled();
});

test('changing a running node\'s labels keeps the existing Pod and rejects only a new placement', async ({ page }) => {
  const figure = await openSorter(page);
  for (const name of ['Evaluate node requirements', 'Score eligible nodes', 'Record assignment', 'Simulate container startup']) {
    await named(figure, name).click();
  }
  await named(figure, 'Change running-node labels').click();
  const card = nodeCard(figure, 'node-b');
  await expect(card).toContainText('Existing Pod sorter-1: still Running here');
  await expect(card).toContainText('New placement under current rules');
  await expect(card).toContainText('Rejected');
  await expect(card).toContainText('nodeSelector needs disk=ssd, node has disk=archive');
  await expect(reportField(figure, 'Who')).toContainText('node administrator');
  await expect(reportField(figure, 'Not yet')).toContainText('No eviction');
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Assigned to node-b');
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Running: yes');
  await expect(named(figure, 'Change running-node labels')).toBeDisabled();
});

test('contradictory hard rules end unscheduled, and the maximum preference cannot rescue them', async ({ page }) => {
  const figure = await openSorter(page);
  const selects = figure.locator('select');
  await selects.nth(0).selectOption('hdd');
  await selects.nth(1).selectOption('east-ssd');
  const weight = figure.getByRole('slider');
  await weight.focus();
  await weight.press('End');
  await expect(reportField(figure, 'Changed')).toContainText('unassigned');
  await step(figure).click();
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('Unscheduled: no node passed the filters');
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Unscheduled');
  await expect(figure.locator('.affinity-lifecycle')).toContainText('Assigned: no');
  await expect(step(figure)).toBeDisabled();
  await expect(step(figure)).toHaveText('Placement finished');
});

test('a failed request capacity has its own indicator while the label checks still pass', async ({ page }) => {
  const figure = await openSorter(page);
  const selects = figure.locator('select');
  await selects.nth(0).selectOption('hdd');
  await selects.nth(1).selectOption('none');
  await figure.getByRole('checkbox').uncheck();
  await step(figure).click();
  const card = nodeCard(figure, 'node-c');
  await expect(card.locator('.affinity-checks li', { hasText: 'nodeSelector' })).toContainText('pass');
  await expect(card.locator('.affinity-checks li', { hasText: 'request capacity' })).toContainText('fail');
  await expect(card).toContainText('Rejected');
  await expect(card).toContainText('request capacity missing');
});

test('the weight slider keeps a draft while the rule commits on change, and stays usable', async ({ page }) => {
  const figure = await openSorter(page);
  const weight = figure.getByRole('slider');
  await weight.focus();
  await weight.press('ArrowRight');
  await weight.press('ArrowRight');
  await weight.press('ArrowRight');
  await expect(weight).toHaveValue('63');
  await expect(weight).toBeEnabled();
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('weight 63');
});

test('keyboard focus advances the placement and reduced motion settles at once', async ({ page }) => {
  const figure = await openSorter(page);
  const button = step(figure);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(reportOf(figure).locator('.anatomy-change-title')).toContainText('2 node(s) passed the filters');
  await expect(reportOf(figure)).toHaveAttribute('aria-busy', 'false');
});

test('the Pod YAML panel matches the explanation example and highlights the fields a filter reads', async ({ page }) => {
  const figure = await openSorter(page);
  const panel = normalize(await figure.locator('.anatomy-manifest pre').textContent());
  const example = normalize(await page.locator('.anatomy-explanation pre').filter({ hasText: 'kind: Pod' }).first().textContent());
  expect(panel).toBe(example);
  await step(figure).click();
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'disk: ssd' })).toHaveCount(1);
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'weight:' })).toHaveCount(0);
});

test('on a 390px phone the controls, ChangeReport and node status stay in one column without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const figure = await openSorter(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await step(figure).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const report = await reportOf(figure).boundingBox();
  const cards = await nodeCard(figure, 'node-a').boundingBox();
  const manifest = await figure.locator('.anatomy-manifest').boundingBox();
  expect(report).not.toBeNull();
  expect(cards).not.toBeNull();
  expect(manifest).not.toBeNull();
  expect(report!.width).toBeLessThanOrEqual(390);
  expect(report!.y).toBeLessThan(cards!.y);
  expect(cards!.y).toBeLessThan(manifest!.y);
});
