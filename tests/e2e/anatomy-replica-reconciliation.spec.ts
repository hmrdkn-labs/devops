import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const bedCounts = (figure: Locator, index: number) =>
  figure.locator('.replica-bed').nth(index).locator('.replica-counts dd').allTextContents();

test('deleting the selected Pod is explicit; the replacement takes the reused slot with a new UID', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  const selected = figure.getByRole('combobox', { name: 'Selected Pod', exact: true });
  const remove = figure.getByRole('button', { name: 'Delete selected Pod', exact: true });
  const step = figure.getByRole('button', { name: 'Step reconciliation', exact: true });
  await expect(selected).toHaveValue('');
  await expect(remove).toBeDisabled();
  await expect(figure.locator('path.replica-pin[opacity="1"]')).toHaveCount(0);

  await selected.selectOption('2');
  await expect(figure.locator('.replica-ledger li[data-selected="true"] strong')).toHaveText('p2');
  await expect(figure.locator('path.replica-pin[opacity="1"]')).toHaveCount(1);
  await expect(figure.locator('.replica-bed').first().locator('li').nth(1)).toContainText('selected');
  await expect(changeTitle(figure)).toHaveText('Selected p2');
  await expect(figure.locator('.anatomy-change')).toContainText('Nothing in the cluster changed');

  await remove.click();
  await expect(changeTitle(figure)).toHaveText('Pod p2 deleted');
  await expect(figure.locator('.anatomy-change dd').nth(1)).toHaveText(/You, deleting the Pod object directly/);
  await expect(figure.locator('.anatomy-change dd').nth(3)).toContainText('p2 is retired and does not come back');
  await expect(selected).toHaveValue('');
  await expect(remove).toBeDisabled();
  await expect(figure.locator('path.replica-pin[opacity="1"]')).toHaveCount(0);
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '2', '2', '0']);
  await expect(figure.locator('.replica-retired')).toContainText('p2');

  await step.click();
  await expect(changeTitle(figure)).toHaveText('RS-v1 created p4');
  await expect(figure.locator('.replica-bed').first().locator('li').nth(1)).toContainText('p4');
  await expect(figure.locator('.replica-bed').first().locator('li').nth(1)).toContainText('new UID');
  await expect(figure.locator('.replica-ledger li strong', { hasText: /^p2$/ })).toHaveCount(0);
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '3', '2', '1']);

  await step.click();
  await expect(changeTitle(figure)).toHaveText('p4 became Ready');
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '3', '3', '0']);
  await expect(figure.locator('.replica-ledger li strong')).toHaveText(['p1', 'p4', 'p3']);
});

test('a rollout reports surge before availability, and the YAML highlights the field each step read', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  const step = figure.getByRole('button', { name: 'Step reconciliation', exact: true });
  const highlighted = figure.locator('.anatomy-manifest mark');

  await figure.getByRole('button', { name: 'Change template to app:v2', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pod template changed to app:v2');
  await expect(highlighted).toContainText('registry.example.com/app:v2');

  await step.click();
  await expect(changeTitle(figure)).toHaveText('Deployment raises RS-v2 target to 1');
  await expect(highlighted).toContainText('maxSurge: 1');
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '3', '3', '0']);

  await step.click();
  await expect(changeTitle(figure)).toHaveText('RS-v2 created p4');
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '3', '3', '0']);
  await expect(bedCounts(figure, 1)).resolves.toEqual(['1', '1', '0', '1']);
  await expect(figure.locator('.replica-bed').nth(1).locator('li').first()).toContainText('Not Ready');

  await step.click();
  await step.click();
  await expect(changeTitle(figure)).toHaveText('Deployment lowers RS-v1 target to 2');
  await expect(highlighted).toContainText('maxUnavailable: 0');
  await expect(figure.locator('.replica-ledger li')).toHaveCount(4);
  await expect(figure.locator('.replica-status')).toContainText('Reconciling');

  for (let i = 0; i < 40 && !(await figure.locator('.replica-status .anatomy-badge').textContent())?.includes('Converged'); i++) {
    await step.click();
    const ready = Number((await figure.locator('.replica-status').textContent())?.match(/Ready (\d+)/)?.[1]);
    expect(ready).toBeGreaterThanOrEqual(3);
  }
  await expect(figure.locator('.replica-status .anatomy-badge')).toHaveText(/Converged/);
  await expect(bedCounts(figure, 0)).resolves.toEqual(['0', '0', '0', '0']);
  await expect(bedCounts(figure, 1)).resolves.toEqual(['3', '3', '3', '0']);
});

test('changing desired replicas names the field and keeps the template revision', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  const desired = figure.getByRole('combobox', { name: 'Desired replicas', exact: true });
  await desired.selectOption('4');
  await expect(changeTitle(figure)).toHaveText('Desired replicas 3 → 4');
  await expect(figure.locator('.anatomy-manifest mark')).toContainText('replicas: 4');
  await expect(figure.locator('.anatomy-manifest mark')).not.toContainText('image');
  await expect(figure.locator('.replica-status')).toContainText('template app:v1');
  await expect(figure.locator('.anatomy-change')).toContainText('the revision stays app:v1');
  await expect(figure.locator('.replica-bed').first().locator('.replica-counts dd').first()).toHaveText('4');
});

test('keyboard activates controls, and motion settles to re-enable the next step', async ({ page }) => {
  const figure = await open(page, 'replica-reconciliation');
  const selected = figure.getByRole('combobox', { name: 'Selected Pod', exact: true });
  const remove = figure.getByRole('button', { name: 'Delete selected Pod', exact: true });
  await selected.selectOption('1');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('Pod p1 deleted');
  const step = figure.getByRole('button', { name: 'Step reconciliation', exact: true });
  await expect(step).toBeEnabled({ timeout: 5000 });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('RS-v1 created p4');
  await expect(bedCounts(figure, 0)).resolves.toEqual(['3', '3', '2', '1']);
});

test('390px phone shows controls, ChangeReport and per-bed status without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  await figure.getByRole('combobox', { name: 'Selected Pod', exact: true }).selectOption('3');
  await figure.getByRole('button', { name: 'Delete selected Pod', exact: true }).click();
  await expect(changeTitle(figure)).toHaveText('Pod p3 deleted');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const change = await figure.locator('.anatomy-change').boundingBox();
  const beds = await figure.locator('.replica-beds').boundingBox();
  expect(change).not.toBeNull();
  expect(beds).not.toBeNull();
  expect(beds!.y).toBeGreaterThan(change!.y);
  expect(beds!.y - (change!.y + change!.height)).toBeLessThan(200);
});
