import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const compare = (figure: Locator, field: string) => figure.locator(`.loop-compare > div[data-field="${field}"] dd`);
const podNames = (figure: Locator) => figure.locator('.loop-pods li strong').allTextContents();
const podRows = (figure: Locator) => figure.locator('.loop-pods li');

test('a spec edit records intent; a pass creates a Created Pod; only the node side makes it Ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  await expect(figure.locator('.loop-status .anatomy-badge', { hasText: 'Converged' })).toHaveCount(1);

  await figure.getByRole('combobox', { name: 'Desired replicas', exact: true }).selectOption('4');
  await expect(changeTitle(figure)).toHaveText('Desired replicas 3 → 4');
  await expect(podRows(figure)).toHaveCount(3);
  await expect(compare(figure, 'generation')).toHaveText('2');
  await expect(compare(figure, 'stored-replicas')).toHaveText('3');

  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Created Pod web-[0-9a-z]{5}$/);
  await expect(podRows(figure)).toHaveCount(4);
  await expect(podRows(figure).filter({ hasText: 'Created, not Ready' })).toHaveCount(1);
  await expect(compare(figure, 'stored-replicas')).toHaveText('3');

  await figure.getByRole('button', { name: 'Node reports one Pod Ready', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/ reported Ready$/);
  await expect(podRows(figure).filter({ hasText: 'Created, not Ready' })).toHaveCount(0);
  await expect(compare(figure, 'stored-ready')).toHaveText('3');

  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Wrote status for generation 2');
  await expect(compare(figure, 'stored-replicas')).toHaveText('4');
  await expect(compare(figure, 'stored-ready')).toHaveText('4');
  await expect(figure.locator('.loop-status .anatomy-badge', { hasText: 'Converged' })).toHaveCount(1);

  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pass wrote nothing');
});

test('two edits before a pass are read as one desired value; the pass removes the newest Pod only', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  const desired = figure.getByRole('combobox', { name: 'Desired replicas', exact: true });
  await desired.selectOption('4');
  await desired.selectOption('2');
  await expect(compare(figure, 'generation')).toHaveText('3');
  await expect(podRows(figure)).toHaveCount(3);

  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Deleted Pod web-[0-9a-z]{5}$/);
  await expect(podRows(figure)).toHaveCount(2);
  await expect(figure.locator('.loop-retired')).toContainText('web-');
});

test('deleting a Pod is drift; the next pass repairs it with a new name and the old name stays retired', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  const before = await podNames(figure);
  const victim = figure.getByRole('combobox', { name: 'Pod to delete', exact: true });
  await victim.selectOption({ index: 2 });
  await figure.getByRole('button', { name: 'Delete Pod object', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Deleted Pod web-[0-9a-z]{5} outside the controller$/);
  await expect(podRows(figure)).toHaveCount(2);
  await expect(compare(figure, 'stored-replicas')).toHaveText('3');
  const deleted = (await changeTitle(figure).textContent())!.match(/web-[0-9a-z]{5}/)![0];
  await expect(figure.locator('.loop-retired')).toContainText(deleted);

  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Created Pod web-[0-9a-z]{5}$/);
  const after = await podNames(figure);
  expect(after).toHaveLength(3);
  expect(after).not.toContain(deleted);
  expect(before).toContain(deleted);
  await figure.getByRole('button', { name: 'Node reports one Pod Ready', exact: true }).click();
  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pass wrote nothing');
});

test('dropping pending hints does not change where the loop converges', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  await figure.getByRole('combobox', { name: 'Desired replicas', exact: true }).selectOption('4');
  await expect(compare(figure, 'hints')).toHaveText('1');
  const drop = figure.getByRole('button', { name: 'Drop pending hints', exact: true });
  await drop.click();
  await expect(changeTitle(figure)).toHaveText('Dropped 1 pending hint');
  await expect(compare(figure, 'hints')).toHaveText('0');
  await expect(drop).toBeDisabled();
  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Created Pod web-[0-9a-z]{5}$/);
});

test('keyboard reaches the controls and activates a pass', async ({ page }) => {
  const figure = await open(page, 'control-loop');
  const pass = figure.getByRole('button', { name: 'Run controller pass', exact: true });
  await pass.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('Pass wrote nothing');
  await expect(figure.getByRole('button', { name: 'Node reports one Pod Ready', exact: true })).toBeDisabled();
});

test('reduced motion reaches the same pose immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  await figure.getByRole('combobox', { name: 'Desired replicas', exact: true }).selectOption('0');
  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Deleted Pod web-[0-9a-z]{5}$/);
  await expect(figure.locator('.loop-status .anatomy-badge', { hasText: 'Reconciling' })).toHaveCount(1);
});

test('390px phone: after a pass, controls, ChangeReport and status badges fit in one viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'control-loop');
  await figure.getByRole('combobox', { name: 'Desired replicas', exact: true }).selectOption('4');
  await figure.getByRole('button', { name: 'Run controller pass', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText(/^Created Pod web-/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const controls = figure.locator('.loop-controls');
  await controls.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const top = await controls.boundingBox();
  const report = await figure.locator('.anatomy-change').boundingBox();
  const status = await figure.locator('.loop-status').boundingBox();
  expect(top).not.toBeNull();
  expect(report).not.toBeNull();
  expect(status).not.toBeNull();
  expect(report!.y).toBeGreaterThanOrEqual(top!.y);
  expect(status!.y).toBeGreaterThan(report!.y);
  expect(status!.y + status!.height).toBeLessThanOrEqual(844);
  expect(top!.y).toBeGreaterThanOrEqual(0);
});
